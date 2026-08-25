// worker/auth.js
//
// Login/logout HTTP handlers + session verification middleware (§72,
// §26-28, Etapa 4 — §90). This is the only place that reads the signed
// session cookie off a `Request` and turns it into verified claims —
// downstream private handlers (Etapa 5+) call `requireSession`/
// `requireTenant` instead of touching `core/session.js`/storage directly,
// so "tenant only ever comes from the verified session, never the request
// body" (§55) has exactly one place to hold.

import {
  getSessionTokenFromRequest,
  verifySessionToken,
  buildSessionCookie,
  buildLogoutCookie,
  UnauthorizedError,
} from "../core/session.js";
import { resolveTenant } from "../core/tenant.js";
import {
  login as loginBusiness,
  getSaltForIdentifier,
  InvalidCredentialsError,
} from "../business/auth.js";
import { getBrokerById } from "../business/brokers.js";
import { ForbiddenError } from "../core/permissions.js";
import { ValidationError } from "../core/validation.js";
import { success, unauthorized, badRequest } from "../core/response.js";

// Etapa 8 (§53) — mirrors business/auth.js#BLOCKED_LOGIN_STATUSES. Sessions
// are stateless (§28, no server-side revocation), so a broker suspended
// *after* already holding a valid cookie would otherwise keep using
// /api/me/* until the token expires. requireTenant below re-checks the
// broker's live status on every private request instead.
const BLOCKED_TENANT_STATUSES = ["suspended", "disabled"];

function sessionSecret(env) {
  if (!env?.SESSION_SECRET) {
    throw new Error("worker/auth: binding SESSION_SECRET ausente em env.");
  }
  return env.SESSION_SECRET;
}

// §27 hotfix — HMAC-peppers the browser's PBKDF2 result (core/auth.js);
// provisioned via `wrangler secret put PASSWORD_PEPPER`, same pattern as
// SESSION_SECRET above.
function passwordPepper(env) {
  if (!env?.PASSWORD_PEPPER) {
    throw new Error("worker/auth: binding PASSWORD_PEPPER ausente em env.");
  }
  return env.PASSWORD_PEPPER;
}

// §27 hotfix pt.3 — keys the CPF/e-mail lookup-index hashes
// (storage/indexes.js#loginIdentifierHash); provisioned via
// `wrangler secret put LOGIN_INDEX_SECRET`. Deliberately separate from
// PASSWORD_PEPPER above — different job (protects the lookup index, not
// the password verifier).
function loginIndexSecret(env) {
  if (!env?.LOGIN_INDEX_SECRET) {
    throw new Error("worker/auth: binding LOGIN_INDEX_SECRET ausente em env.");
  }
  return env.LOGIN_INDEX_SECRET;
}

/** Verifies the signed session cookie on `request`. Returns claims or `null` — never throws on a missing/invalid/expired cookie. */
export async function getSession(request, env) {
  const token = getSessionTokenFromRequest(request);
  if (!token) return null;
  return verifySessionToken(token, sessionSecret(env));
}

/**
 * Same as `getSession`, but throws `UnauthorizedError` instead of returning
 * `null` — the gate every private handler (Etapa 5+) is expected to call
 * before doing anything else.
 */
export async function requireSession(request, env) {
  const session = await getSession(request, env);
  if (!session) throw new UnauthorizedError();
  return session;
}

/**
 * `requireSession` plus the tenant it resolves to (§55) — the shape most
 * private handlers actually want: `{ session, tenant }`, where `tenant` is
 * `null` for a superadmin session with no brokerId of its own (§53 acts
 * cross-tenant by design, see core/tenant.js).
 *
 * Etapa 8: for a broker session, also re-checks the broker's live status —
 * see `BLOCKED_TENANT_STATUSES` above. Skipped for a superadmin session
 * (never subject to broker suspension, even though it happens to carry a
 * brokerId of its own per business/auth.js's identity model).
 */
export async function requireTenant(request, env) {
  const session = await requireSession(request, env);
  const tenant = resolveTenant(session);

  if (tenant && session.role !== "superadmin") {
    const broker = await getBrokerById(env, tenant.brokerId);
    if (!broker || BLOCKED_TENANT_STATUSES.includes(broker.status)) {
      throw new ForbiddenError("Conta suspensa.");
    }
  }

  return { session, tenant };
}

/**
 * POST /api/auth/salt (§27 hotfix). Step 1 of the browser-side login flow:
 * returns the PBKDF2 salt/iterations for `identifier` (a CPF, or the
 * MASTER/TESTE special identifiers, §27 hotfix pt.2) so the browser can
 * derive its PBKDF2 result locally — identical response shape whether or
 * not the identifier exists/is provisioned (§26 "resposta genérica"),
 * never a 404/differentiated error that would leak which ones are real.
 */
export async function handleAuthSalt(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("JSON inválido.");
  }

  const identifier = typeof body?.identifier === "string" ? body.identifier : "";

  try {
    const payload = await getSaltForIdentifier(env, identifier, {
      pepper: passwordPepper(env),
      loginIndexSecret: loginIndexSecret(env),
    });
    return success(payload);
  } catch (error) {
    if (error instanceof ValidationError) {
      return badRequest("Identificador inválido.");
    }
    throw error;
  }
}

/**
 * POST /api/auth/login (§72). Step 2: the browser already derived
 * `pbkdf2Result` locally (never the password) against the salt from
 * `handleAuthSalt` above; the Worker only applies PASSWORD_PEPPER
 * (HMAC-SHA256, core/auth.js) and compares — see §27 hotfix notes in
 * business/auth.js. `identifier` is a CPF for almost everyone, or MASTER/
 * TESTE for the two special homologação accounts (§27 hotfix pt.2) — same
 * request shape either way, business/auth.js#login sorts out which.
 */
export async function handleLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("JSON inválido.");
  }

  const identifier = typeof body?.identifier === "string" ? body.identifier : "";
  const pbkdf2Result = typeof body?.pbkdf2Result === "string" ? body.pbkdf2Result : "";

  try {
    const { token, claims } = await loginBusiness(
      env,
      { identifier, pbkdf2Result },
      { sessionSecret: sessionSecret(env), pepper: passwordPepper(env), loginIndexSecret: loginIndexSecret(env) },
    );
    return success(
      { userId: claims.userId, brokerId: claims.brokerId ?? null, slug: claims.slug ?? null, role: claims.role },
      { headers: { "Set-Cookie": buildSessionCookie(token) } },
    );
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return unauthorized("CPF ou senha inválidos.");
    }
    throw error;
  }
}

/**
 * POST /api/auth/logout (§72). Sessions are stateless/HMAC-signed (§28) —
 * there is no server-side session store to revoke, so "logout" is exactly
 * expiring the cookie client-side. No KV/D1 revocation list is introduced
 * (§93 forbids adding either just for this).
 */
export async function handleLogout() {
  return success({ loggedOut: true }, { headers: { "Set-Cookie": buildLogoutCookie() } });
}
