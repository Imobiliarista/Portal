// worker/bootstrap.js
//
// POST /api/admin/bootstrap-special-accounts — one-off HTTP alternative to
// `scripts/bootstrap-special-accounts.js` for provisioning/reprovisioning
// the MASTER/TESTE special accounts (§27 hotfix pt.2, business/auth.js#
// SPECIAL_IDENTIFIERS, docs/OPERATIONS.md item 18), for when running the
// interactive CLI against the real environment isn't practical (e.g. no
// direct `wrangler`-authenticated shell access to that environment).
//
// Guarded by its own secret, `SUPERADMIN_BOOTSTRAP_SECRET` — deliberately
// NOT provisioned by default (see docs/OPERATIONS.md "Segredos"): the
// project owner adds it in the Cloudflare dashboard only when about to use
// this route, and removes it right after. Because "remove it right after"
// is a manual step someone can forget, this route is built to stay safe
// even if the secret lingers configured for a while:
//
//   Guard 1 — `env.SUPERADMIN_BOOTSTRAP_SECRET` absent: the route responds
//   with the exact same 404 shape `core/app.js` uses for a path that
//   matches no route at all (`notFound("Rota não encontrada.")`), and does
//   nothing else — no body read, no R2 call, nothing that could time
//   differently from a genuinely unregistered route.
//   Guard 2 — the request's `secret` doesn't match (compared with
//   `core/security.js#timingSafeEqual`, never a new comparison): same 404,
//   for the same reason — a wrong guess must look identical to the secret
//   not being configured at all, never a 401/403 that would confirm the
//   route exists.
//   Guard 3 — never silently overwrite an already-provisioned account:
//   requires an explicit top-level `"force": true` to reprovision.
//   Guard 4 — password strength is whatever `business/auth.js#
//   provisionSpecialAccount` (via `core/auth.js#deriveClientPbkdf2`)
//   already enforces (>= 8 chars) — not reimplemented here, its rejection
//   `Error` is just mapped onto a 400.
//
// Known trade-off, accepted for this lot: `provisionSpecialAccount` runs
// the full 600k-iteration PBKDF2 derivation (`core/auth.js#
// deriveClientPbkdf2`) synchronously inside this Worker request — exactly
// the per-request CPU cost the §27 hotfix moved out of the login path.
// Acceptable here because this route is never on a hot path (one-off,
// secret-gated, deleted after use) and the CLI script has no such budget
// at all; not a precedent for any other endpoint. See docs/OPERATIONS.md.
//
// Isolated from worker/admin.js on purpose: this is temporary/removable
// scaffolding, not a permanent part of the admin surface, and admin.js is
// already sizeable — keeping this self-contained makes it trivial to
// delete the whole file (plus its one line in worker/index.js) once the
// team is confident it's no longer needed.

import { getPrivate, putPrivate } from "../storage/private.js";
import { privateKeys } from "../storage/keys.js";
import { hmacSha256Hex, resolveSpecialLogin } from "../storage/indexes.js";
import { timingSafeEqual } from "../core/security.js";
import { success, notFound, badRequest, conflict } from "../core/response.js";
import { provisionSpecialAccount } from "../business/auth.js";
import { createBroker, getBrokerBySlug } from "../business/brokers.js";

const MASTER_KIND = "master";
const TESTE_KIND = "teste";

// Same fixed identities `scripts/bootstrap-special-accounts.js` uses by
// default (docs/OPERATIONS.md item 18) — kept in exact sync with that
// script so either path lands on the same userId/brokerId.
const MASTER_USER_ID = "user_master_homolog";
const TESTE_BROKER_SEED = {
  userId: "user_teste_homolog",
  slug: "teste-homologacao", // "teste" sozinho é reservado — business/brokers.js#RESERVED_SLUGS
  name: "Conta de teste (homologação)",
  plan: "internal",
  status: "active",
};

const RATE_LIMIT_MAX_PER_IP_PER_DAY = 10;

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || null;
}

// Best-effort, same shape/limitation as modules/saved-search/service.js's
// enforceRateLimit — R2 has no atomic increment here, so a race between two
// requests from the same IP in the same instant can undercount by one.
// Fine for a deterrent against a secret-guessing script, not a hard cap.
async function withinRateLimit(env, request) {
  const ip = clientIp(request);
  if (!ip) return true; // no IP available (e.g. local dev) — nothing to key the limit on

  const dateStamp = new Date().toISOString().slice(0, 10);
  const ipHash = await hmacSha256Hex(`bootstrap-secret-ip:${ip}`, env.SUPERADMIN_BOOTSTRAP_SECRET);
  const key = privateKeys.bootstrapAttempt(ipHash, dateStamp);
  const counter = await getPrivate(env, key);
  const count = counter?.count ?? 0;
  if (count >= RATE_LIMIT_MAX_PER_IP_PER_DAY) return false;

  await putPrivate(env, key, { count: count + 1 });
  return true;
}

// Picks only the two allowed keys, each requiring a string `password` —
// anything else (missing "accounts", empty object, non-string password)
// yields `null` so the caller can reject it as a bad request.
function pickRequestedAccounts(body) {
  const accounts = body?.accounts;
  if (!accounts || typeof accounts !== "object") return null;

  const requested = {};
  for (const kind of [MASTER_KIND, TESTE_KIND]) {
    const entry = accounts[kind];
    if (entry && typeof entry === "object" && typeof entry.password === "string") {
      requested[kind] = entry.password;
    }
  }
  return Object.keys(requested).length > 0 ? requested : null;
}

// Mirrors scripts/bootstrap-special-accounts.js#ensureTesteBroker: reuse an
// already-known brokerId, then an existing broker by slug, only creating a
// new one if neither exists.
async function ensureTesteBroker(env, existingBrokerId) {
  if (existingBrokerId) return existingBrokerId;

  const bySlug = await getBrokerBySlug(env, TESTE_BROKER_SEED.slug);
  if (bySlug) return bySlug.brokerId;

  const broker = await createBroker(env, TESTE_BROKER_SEED, {
    loginIndexSecret: env.LOGIN_INDEX_SECRET,
    allowMissingCpf: true,
  });
  return broker.brokerId;
}

/**
 * POST /api/admin/bootstrap-special-accounts. Body:
 *   { "secret": "...", "force"?: true,
 *     "accounts": { "master"?: { "password": "..." }, "teste"?: { "password": "..." } } }
 * See this file's header for the guard order/reasoning.
 */
export async function handleBootstrapSpecialAccounts(request, env) {
  // Guard 1 — the route doesn't exist unless the secret is configured.
  // Checked before touching the request body/R2 at all, so this path is
  // indistinguishable (status, body, headers, and work done) from a
  // pathname that matches no route in core/router.js.
  if (!env?.SUPERADMIN_BOOTSTRAP_SECRET) {
    return notFound("Rota não encontrada.");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return notFound("Rota não encontrada.");
  }

  if (!(await withinRateLimit(env, request))) {
    return notFound("Rota não encontrada.");
  }

  // Guard 2 — wrong secret looks exactly like the route not existing.
  if (typeof body?.secret !== "string" || !timingSafeEqual(body.secret, env.SUPERADMIN_BOOTSTRAP_SECRET)) {
    return notFound("Rota não encontrada.");
  }

  const requested = pickRequestedAccounts(body);
  if (!requested) {
    return badRequest('Informe "accounts.master" e/ou "accounts.teste", cada um com "password".');
  }

  const force = body.force === true;

  // Guard 3 — check every requested kind's existing state up front, before
  // provisioning any of them, so a request touching both accounts never
  // silently overwrites one while rejecting the other.
  const existingByKind = {};
  for (const kind of Object.keys(requested)) {
    existingByKind[kind] = await resolveSpecialLogin(env, kind);
  }
  if (!force) {
    const alreadyProvisioned = Object.keys(requested).filter((kind) => existingByKind[kind]);
    if (alreadyProvisioned.length > 0) {
      return conflict(
        `Conta(s) já provisionada(s), não alterada(s): ${alreadyProvisioned
          .map((kind) => kind.toUpperCase())
          .join(", ")}. Envie "force": true para sobrescrever.`,
      );
    }
  }

  const pepper = env.PASSWORD_PEPPER;
  if (typeof pepper !== "string" || pepper.length === 0) {
    throw new Error("worker/bootstrap: binding PASSWORD_PEPPER ausente em env.");
  }

  // Processed master-then-teste; if both are requested and master succeeds
  // but teste's password then fails Guard 4, master is left provisioned
  // (not rolled back) — the 400 response only reports teste's failure. Rare
  // in practice (this is a manual, one-off call with both passwords chosen
  // up front) and not worth the added complexity of a rollback for a route
  // meant to be deleted after use; a `force`-guarded retry against master
  // is harmless if this ever happens.
  const result = {};
  try {
    if (requested[MASTER_KIND] !== undefined) {
      await provisionSpecialAccount(env, "MASTER", MASTER_USER_ID, requested[MASTER_KIND], { pepper });
      result.master = "provisioned";
    }

    if (requested[TESTE_KIND] !== undefined) {
      const brokerId = await ensureTesteBroker(env, existingByKind[TESTE_KIND]?.brokerId);
      await provisionSpecialAccount(env, "TESTE", TESTE_BROKER_SEED.userId, requested[TESTE_KIND], {
        pepper,
        brokerId,
      });
      result.teste = "provisioned";
      result.brokerId = brokerId;
    }
  } catch (error) {
    // Guard 4 — the password-strength rule lives in
    // core/auth.js#deriveClientPbkdf2 (>= 8 chars), reused as-is via
    // provisionSpecialAccount; it throws a plain Error, mapped onto a 400
    // here instead of being re-implemented/re-checked in this file.
    if (error instanceof Error && error.message.includes("Senha deve ter ao menos")) {
      return badRequest(error.message);
    }
    throw error;
  }

  return success(result);
}
