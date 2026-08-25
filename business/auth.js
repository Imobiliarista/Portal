// business/auth.js
//
// Private auth-identity domain (§26-§28, §27 hotfix). Owns the
// authoritative credential record in R2 PRIVATE (`auth/{userId}.json`,
// `storage/keys.js#privateKeys.authUser`) — deliberately separate from
// `business/brokers.js`'s broker profile (`brokers/{brokerId}/profile-draft.json`,
// schema `additionalProperties: false`, no room for a verifier there).
//
// §27 hotfix — PBKDF2 moved off the Worker: core/auth.js's old
// hashPassword/verifyPassword ran 210k PBKDF2 iterations per login
// request, well past Workers Free's 10ms CPU budget. New shape:
//   1. GET/POST the CPF's PBKDF2 salt (getSaltForCpf below) — identical
//      response for an existing/nonexistent CPF (§26 "resposta genérica"),
//      reusing the same generic-response instinct as `login` itself.
//   2. Browser derives PBKDF2 locally (600k iterations, Web Crypto,
//      frontend/painel/auth.js) and sends only the result over HTTPS —
//      never the password.
//   3. `login` applies PASSWORD_PEPPER (HMAC-SHA256, core/auth.js) to that
//      result and compares it to the stored verifier — the only crypto the
//      Worker still does per login, and it's cheap.
// `auth/{userId}.json` never holds the password or the raw PBKDF2 output —
// only the salt (public, needed by the browser) and the peppered verifier.
//
// Login needs both halves of the identity (§26 "resolve índice privado →
// carrega auth object → verifica verificador"):
//   - business/brokers.getBrokerByCpf -> broker/tenant context (brokerId,
//     slug), via the broker-CPF index — CPF is the login identifier as of
//     this hotfix (see business/brokers.js's own docstring for why this
//     isn't the generic storage/indexes.js#loginIndex: that index is
//     reserved for an auth identity with no broker profile, e.g. a future
//     superadmin, per docs/DATA-MODEL.md).
//   - getAuthUser (this file) -> verifier/role/authVersion via
//     `auth/{userId}.json`, keyed off the broker's own `userId`.
//
// Every failure path — unknown CPF, missing credential record, wrong
// password — throws the same InvalidCredentialsError with the same message,
// per the "resposta genérica" requirement (§26): the caller must never be
// able to tell which half failed.

import { getPrivate, putPrivate } from "../storage/private.js";
import { privateKeys } from "../storage/keys.js";
import {
  generateSalt,
  deriveDummySalt,
  buildSaltPayload,
  hashPbkdf2Result,
  verifyPbkdf2Result,
  deriveClientPbkdf2,
  PBKDF2_ITERATIONS,
} from "../core/auth.js";
import { createSessionToken } from "../core/session.js";
import { loginIdentifierHash } from "../storage/indexes.js";
import { isNonEmptyString, isCpf, normalizeCpf, isEnum, ValidationError } from "../core/validation.js";
import { getBrokerByCpf } from "./brokers.js";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("CPF ou senha inválidos.");
    this.name = "InvalidCredentialsError";
  }
}

// Only "broker" is ever minted by this lot's code path (via setAuthPassword
// below, called for accounts business/brokers.createBroker already created).
// "superadmin" is accepted by the type so `auth/{userId}.json` can hold a
// manually-provisioned admin identity ahead of Etapa 8, but nothing here
// creates one.
const ROLES = ["broker", "superadmin"];

// Etapa 8 (§53) — statuses that block login even with correct credentials.
// "pending" (not yet approved by a superadmin) is deliberately NOT here: a
// broker awaiting approval can still log into the painel to fill in their
// profile/draft listings while they wait (nothing in §90/§53 says
// otherwise, and business/publishing.js#publishBroker already keeps a
// pending broker's public footprint at zero regardless of what they save).
const BLOCKED_LOGIN_STATUSES = ["suspended", "disabled"];

// A syntactically valid (but never-matched-for-a-real-account) verifier,
// computed once per process and reused as the right-hand side of
// verifyPbkdf2Result when no real credential record exists. Deliberately
// NOT derived from the real PASSWORD_PEPPER — it never needs to match
// anything, so it doesn't need the secret either. This keeps `login`
// exercising the exact same comparison call whether or not the CPF has a
// credential record (§26), the same instinct as the old dummy-hash
// pattern, even though the risk it defends against is much smaller now
// that the Worker's per-login crypto is one cheap HMAC instead of 210k
// PBKDF2 iterations.
let dummyVerifierPromise;
function getDummyVerifier() {
  if (!dummyVerifierPromise) {
    dummyVerifierPromise = hashPbkdf2Result(
      "ZHVtbXktcGJrZGYyLXJlc3VsdC1uZXZlci1yZWFs",
      "dummy-pepper-never-used-for-real-verification",
    );
  }
  return dummyVerifierPromise;
}

/** Reads the private credential record for `userId`. Returns `null` if absent. */
export async function getAuthUser(env, userId) {
  if (!isNonEmptyString(userId)) return null;
  return getPrivate(env, privateKeys.authUser(userId));
}

/**
 * Creates or updates the credential half of `userId`'s identity: derives
 * PBKDF2 + PASSWORD_PEPPER locally (never stores/logs the plaintext or the
 * raw PBKDF2 output, §27/§79) and bumps `authVersion`. `pepper` must be the
 * live `PASSWORD_PEPPER` secret (worker/auth.js resolves it from `env`, the
 * same pattern as `core/session.js`'s explicit `secret` param).
 *
 * This is admin/script provisioning ONLY — it runs the full 600k-iteration
 * PBKDF2 itself (via `core/auth.js#deriveClientPbkdf2`), which is fine
 * outside a Worker request but must never be wired to a live HTTP handler:
 * that would reintroduce the exact CPU-budget bug this hotfix fixes. A
 * future self-service signup/password-set endpoint needs its own flow that
 * accepts an already browser-derived PBKDF2 result, mirroring `login`
 * below — see this PR's pendências.
 *
 * Not a signup flow either way — the broker/business profile (including
 * `cpf`, the login identifier) is created separately by
 * `business/brokers.createBroker`; this only ever touches
 * `auth/{userId}.json`.
 */
export async function setAuthPassword(env, userId, password, { role = "broker", pepper } = {}) {
  if (!isNonEmptyString(userId)) {
    throw new ValidationError([{ field: "userId", message: "obrigatório" }]);
  }
  if (!isEnum(role, ROLES)) {
    throw new ValidationError([{ field: "role", message: "valor inválido" }]);
  }
  if (!isNonEmptyString(pepper)) {
    throw new ValidationError([{ field: "pepper", message: "obrigatório" }]);
  }

  const current = await getAuthUser(env, userId);
  const salt = generateSalt();
  const pbkdf2Result = await deriveClientPbkdf2(password, salt, PBKDF2_ITERATIONS);
  const verifier = await hashPbkdf2Result(pbkdf2Result, pepper);

  const record = {
    schemaVersion: 2,
    userId,
    role: current?.role ?? role,
    pbkdf2Salt: salt,
    pbkdf2Iterations: PBKDF2_ITERATIONS,
    verifier,
    authVersion: (current?.authVersion ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };

  await putPrivate(env, privateKeys.authUser(userId), record);
  return record;
}

/**
 * Step 1 of the browser-side login flow: returns the PBKDF2 salt/iterations
 * for `cpf` — the real stored salt for a known broker, or a deterministic
 * dummy for an unknown one (§26 "resposta genérica" applied to CPF
 * enumeration: same shape, same field set, stable across repeated calls).
 * `pepper` must be the live `PASSWORD_PEPPER` secret.
 */
export async function getSaltForCpf(env, cpf, pepper) {
  if (!isCpf(cpf)) {
    throw new ValidationError([{ field: "cpf", message: "valor inválido" }]);
  }

  const broker = await getBrokerByCpf(env, cpf);
  const authUser = broker ? await getAuthUser(env, broker.userId) : null;

  if (authUser?.pbkdf2Salt) {
    return buildSaltPayload(authUser.pbkdf2Salt, authUser.pbkdf2Iterations);
  }

  const identifierHash = await loginIdentifierHash(normalizeCpf(cpf));
  const dummySalt = await deriveDummySalt(identifierHash, pepper);
  return buildSaltPayload(dummySalt);
}

/**
 * Verifies CPF + the browser's PBKDF2 result and issues a signed session
 * token (§26, §28). Throws `InvalidCredentialsError` uniformly — see module
 * docstring. `sessionSecret`/`pepper` must be the live `SESSION_SECRET`/
 * `PASSWORD_PEPPER` secrets (worker/auth.js resolves both from `env`).
 */
export async function login(env, { cpf, pbkdf2Result } = {}, { sessionSecret, pepper } = {}) {
  if (!isCpf(cpf) || !isNonEmptyString(pbkdf2Result)) {
    throw new InvalidCredentialsError();
  }

  const broker = await getBrokerByCpf(env, cpf);
  const authUser = broker ? await getAuthUser(env, broker.userId) : null;

  const storedVerifier = authUser?.verifier ?? (await getDummyVerifier());
  const passwordOk = await verifyPbkdf2Result(pbkdf2Result, pepper, storedVerifier);

  // Etapa 8 (§53) — um corretor suspenso (ou "disabled", o estado mais
  // forte do mesmo enum, business/brokers.js#BROKER_STATUSES) nunca ganha
  // sessão, mesmo com senha correta. Mesmo InvalidCredentialsError genérico
  // de sempre — não revela a um atacante que testou um CPF que a conta
  // existe e está suspensa, em vez de simplesmente não existir ou ter senha
  // errada.
  const brokerBlocked = broker && BLOCKED_LOGIN_STATUSES.includes(broker.status);

  if (!broker || !authUser || !passwordOk || brokerBlocked) {
    throw new InvalidCredentialsError();
  }

  const claims = {
    userId: broker.userId,
    brokerId: broker.brokerId,
    slug: broker.slug,
    role: authUser.role,
    authVersion: authUser.authVersion,
  };

  const token = await createSessionToken(claims, sessionSecret);
  return { token, claims, broker };
}
