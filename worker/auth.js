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
import { login as loginBusiness, InvalidCredentialsError } from "../business/auth.js";
import { getBrokerById } from "../business/brokers.js";
import { ForbiddenError } from "../core/permissions.js";
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

/** POST /api/auth/login (§72). */
export async function handleLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("JSON inválido.");
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  try {
    const { token, claims } = await loginBusiness(env, { email, password }, sessionSecret(env));
    return success(
      { userId: claims.userId, brokerId: claims.brokerId, slug: claims.slug, role: claims.role },
      { headers: { "Set-Cookie": buildSessionCookie(token) } },
    );
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return unauthorized("E-mail ou senha inválidos.");
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
