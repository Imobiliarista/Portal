// business/auth.js
//
// Private auth-identity domain (§26-§28, §27 hotfix). Owns the
// authoritative credential record in R2 PRIVATE (`auth/{userId}.json`,
// `storage/keys.js#privateKeys.authUser`) — deliberately separate from
// `business/brokers.js`'s broker profile (`brokers/{brokerId}/profile-draft.json`,
// schema `additionalProperties: false`, no room for a verifier there).
//
// §27 hotfix pt.1 — PBKDF2 moved off the Worker: core/auth.js's old
// hashPassword/verifyPassword ran 210k PBKDF2 iterations per login
// request, well past Workers Free's 10ms CPU budget. New shape:
//   1. GET/POST the identifier's PBKDF2 salt (getSaltForIdentifier below)
//      — identical response for an existing/nonexistent identifier (§26
//      "resposta genérica"), reusing the same generic-response instinct as
//      `login` itself.
//   2. Browser derives PBKDF2 locally (600k iterations, Web Crypto,
//      frontend/{painel,admin}/data.js) and sends only the result over
//      HTTPS — never the password.
//   3. `login` applies PASSWORD_PEPPER (HMAC-SHA256, core/auth.js) to that
//      result and compares it to the stored verifier — the only crypto the
//      Worker still does per login, and it's cheap.
// No credential record ever holds the password or the raw PBKDF2 output —
// only the salt (public, needed by the browser) and the peppered verifier.
//
// §27 hotfix pt.2 — SPECIAL_IDENTIFIERS below is an exact, closed allowlist
// of exactly two non-CPF identifiers (MASTER/TESTE) for homologação. This
// is deliberately NOT a generic username-login system: every other
// identifier is validated as a CPF (`core/validation.js#isCpf`) and nothing
// else — never name/slug/e-mail/apelido. `resolveSpecialIdentifier` is the
// only place that string comparison happens, and it's a closed switch, not
// an extensible registry.
//
// Login needs both halves of the identity (§26 "resolve índice privado →
// carrega registro de auth → verifica verificador"):
//   - for a CPF: business/brokers.getBrokerByCpf -> broker/tenant context
//     (brokerId, slug), via the broker-CPF index, then getAuthUser (this
//     file) -> verifier/role/authVersion via `auth/{userId}.json`, keyed
//     off the broker's own `userId`. (The generic storage/indexes.js#loginIndex
//     stays reserved for a future auth identity with no broker profile at
//     all and no special-identifier home either — unused by both paths
//     here, per docs/DATA-MODEL.md.)
//   - for MASTER/TESTE: `indexes/login-special/{kind}.json`
//     (storage/indexes.js#resolveSpecialLogin) holds the credential record
//     directly — MASTER has no broker at all; TESTE's record carries the
//     `brokerId` of the broker `provisionSpecialAccount` provisioned for it
//     (business/brokers.createBroker with `allowMissingCpf: true`).
//
// Every failure path — unknown identifier, missing credential record,
// wrong password, suspended broker — throws the same
// InvalidCredentialsError with the same message, per the "resposta
// genérica" requirement (§26): the caller must never be able to tell which
// half failed, nor whether a CPF/MASTER/TESTE identifier exists at all.

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
import { loginIdentifierHash, resolveSpecialLogin, setSpecialLogin } from "../storage/indexes.js";
import { isNonEmptyString, isCpf, normalizeCpf, isEnum, ValidationError } from "../core/validation.js";
import { getBrokerByCpf, getBrokerById } from "./brokers.js";

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
// creates one via setAuthPassword — MASTER (the actual superadmin identity,
// §27 hotfix pt.2) goes through provisionSpecialAccount instead, which
// never touches `auth/{userId}.json` at all.
const ROLES = ["broker", "superadmin"];

// Etapa 8 (§53) — statuses that block login even with correct credentials.
// "pending" (not yet approved by a superadmin) is deliberately NOT here: a
// broker awaiting approval can still log into the painel to fill in their
// profile/draft listings while they wait (nothing in §90/§53 says
// otherwise, and business/publishing.js#publishBroker already keeps a
// pending broker's public footprint at zero regardless of what they save).
const BLOCKED_LOGIN_STATUSES = ["suspended", "disabled"];

// §27 hotfix pt.2 — the exact, closed allowlist. Matched case-insensitively
// with trim applied (business/auth.js#resolveSpecialIdentifier); anything
// that doesn't match one of these two keys is never "special" and must be
// a CPF instead. `role` is what the issued session carries — TESTE gets
// "broker" (a real corretor/anunciante account for commercial homologação,
// per the request), never "superadmin"; MASTER gets "superadmin" and
// never has a broker record.
const SPECIAL_IDENTIFIERS = {
  MASTER: { kind: "master", role: "superadmin" },
  TESTE: { kind: "teste", role: "broker" },
};

function resolveSpecialIdentifier(identifier) {
  if (typeof identifier !== "string") return null;
  return SPECIAL_IDENTIFIERS[identifier.trim().toUpperCase()] ?? null;
}

// A syntactically valid (but never-matched-for-a-real-account) verifier,
// computed once per process and reused as the right-hand side of
// verifyPbkdf2Result when no real credential record exists — for a CPF
// login, a MASTER/TESTE login, or anything else. Deliberately NOT derived
// from the real PASSWORD_PEPPER — it never needs to match anything, so it
// doesn't need the secret either. This keeps `login` exercising the exact
// same comparison call regardless of whether the identifier resolves to
// anything (§26), the same instinct as the old dummy-hash pattern, even
// though the risk it defends against is much smaller now that the
// Worker's per-login crypto is one cheap HMAC instead of 210k PBKDF2
// iterations.
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

/**
 * Resolves `identifier` (a CPF, or MASTER/TESTE) to its credential record
 * and — if any — broker context, without doing any password verification.
 * Shared by `getSaltForIdentifier` and `login` so both agree on exactly
 * what "this identifier exists" means. Returns `{ authRecord: null,
 * broker: null }` for anything that doesn't resolve — malformed CPF,
 * unknown CPF, or an unprovisioned MASTER/TESTE — never throws.
 */
async function resolveLoginTarget(env, identifier, loginIndexSecret) {
  const special = resolveSpecialIdentifier(identifier);
  if (special) {
    const record = await resolveSpecialLogin(env, special.kind);
    const broker = record?.brokerId ? await getBrokerById(env, record.brokerId) : null;
    return { authRecord: record ?? null, broker, special };
  }

  if (!isCpf(identifier)) {
    return { authRecord: null, broker: null, special: null };
  }
  const broker = await getBrokerByCpf(env, identifier, loginIndexSecret);
  const authRecord = broker ? await getAuthUser(env, broker.userId) : null;
  return { authRecord, broker, special: null };
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
 * `cpf`, the login identifier for every non-special account) is created
 * separately by `business/brokers.createBroker`; this only ever touches
 * `auth/{userId}.json`. For MASTER/TESTE, use `provisionSpecialAccount`
 * instead — those two never get an `auth/{userId}.json` record.
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
 * Provisions credentials for MASTER or TESTE (§27 hotfix pt.2). Admin/
 * script ONLY — same CPU-budget reasoning as `setAuthPassword`, never call
 * from a Worker request handler.
 *
 * For "MASTER": no `brokerId` — it has no broker record at all ("conta só
 * em administradores"). For "TESTE": `brokerId` is required and must
 * already exist — provision its broker record first via
 * `business/brokers.createBroker(env, { ...sem cpf... }, { loginIndexSecret,
 * allowMissingCpf: true })` ("conta só em corretores/anunciantes"), then
 * pass its `userId`/`brokerId` here.
 *
 * Always marks the record `temporary: true` — both accounts are for
 * homologação only. There is no self-service password-change flow yet, so
 * rotating/disabling them before real production use is a manual step —
 * see docs/OPERATIONS.md.
 */
export async function provisionSpecialAccount(env, identifier, userId, password, { pepper, brokerId = null } = {}) {
  const special = resolveSpecialIdentifier(identifier);
  if (!special) {
    throw new ValidationError([{ field: "identifier", message: "deve ser MASTER ou TESTE" }]);
  }
  if (!isNonEmptyString(userId)) {
    throw new ValidationError([{ field: "userId", message: "obrigatório" }]);
  }
  if (special.kind === "master" && brokerId) {
    throw new ValidationError([{ field: "brokerId", message: "MASTER não tem corretor associado" }]);
  }
  if (special.kind === "teste" && !isNonEmptyString(brokerId)) {
    throw new ValidationError([{ field: "brokerId", message: "obrigatório para TESTE" }]);
  }
  if (!isNonEmptyString(pepper)) {
    throw new ValidationError([{ field: "pepper", message: "obrigatório" }]);
  }

  const current = await resolveSpecialLogin(env, special.kind);
  const salt = generateSalt();
  const pbkdf2Result = await deriveClientPbkdf2(password, salt, PBKDF2_ITERATIONS);
  const verifier = await hashPbkdf2Result(pbkdf2Result, pepper);

  const record = {
    schemaVersion: 1,
    kind: special.kind,
    userId,
    ...(brokerId ? { brokerId } : {}),
    role: special.role,
    pbkdf2Salt: salt,
    pbkdf2Iterations: PBKDF2_ITERATIONS,
    verifier,
    authVersion: (current?.authVersion ?? 0) + 1,
    temporary: true,
    updatedAt: new Date().toISOString(),
  };

  await setSpecialLogin(env, special.kind, record);
  return record;
}

/**
 * Step 1 of the browser-side login flow: returns the PBKDF2 salt/iterations
 * for `identifier` (a CPF, or MASTER/TESTE) — the real stored salt when it
 * resolves to something, or a deterministic dummy otherwise (§26 "resposta
 * genérica" applied to enumeration: same shape, same field set, stable
 * across repeated calls for the same identifier, whichever of the three
 * kinds it is). `pepper` must be the live `PASSWORD_PEPPER` secret,
 * `loginIndexSecret` the live `LOGIN_INDEX_SECRET` (§27 hotfix pt.3).
 */
export async function getSaltForIdentifier(env, identifier, { pepper, loginIndexSecret } = {}) {
  if (!resolveSpecialIdentifier(identifier) && !isCpf(identifier)) {
    throw new ValidationError([{ field: "identifier", message: "valor inválido" }]);
  }

  const { authRecord, special } = await resolveLoginTarget(env, identifier, loginIndexSecret);
  if (authRecord?.pbkdf2Salt) {
    return buildSaltPayload(authRecord.pbkdf2Salt, authRecord.pbkdf2Iterations);
  }

  // MASTER/TESTE need no hashing (see storage/keys.js#loginSpecial) — a
  // fixed, unique-per-kind message into the same dummy-salt derivation is
  // enough. Only the CPF path needs the keyed hash (small identifier
  // space, enumerable — §27 hotfix pt.3).
  const dummySeed = special ? `special:${special.kind}` : await loginIdentifierHash(normalizeCpf(identifier), loginIndexSecret);
  const dummySalt = await deriveDummySalt(dummySeed, pepper);
  return buildSaltPayload(dummySalt);
}

/**
 * Verifies `identifier` (CPF, or MASTER/TESTE) + the browser's PBKDF2
 * result and issues a signed session token (§26, §28). Throws
 * `InvalidCredentialsError` uniformly — see module docstring.
 * `sessionSecret`/`pepper`/`loginIndexSecret` must be the live
 * `SESSION_SECRET`/`PASSWORD_PEPPER`/`LOGIN_INDEX_SECRET` secrets
 * (worker/auth.js resolves all three from `env`).
 */
export async function login(env, { identifier, pbkdf2Result } = {}, { sessionSecret, pepper, loginIndexSecret } = {}) {
  if (typeof identifier !== "string" || !isNonEmptyString(pbkdf2Result)) {
    throw new InvalidCredentialsError();
  }
  if (!resolveSpecialIdentifier(identifier) && !isCpf(identifier)) {
    throw new InvalidCredentialsError();
  }

  const { authRecord, broker } = await resolveLoginTarget(env, identifier, loginIndexSecret);

  const storedVerifier = authRecord?.verifier ?? (await getDummyVerifier());
  const passwordOk = await verifyPbkdf2Result(pbkdf2Result, pepper, storedVerifier);

  // Etapa 8 (§53) — um corretor suspenso (ou "disabled", o estado mais
  // forte do mesmo enum, business/brokers.js#BROKER_STATUSES) nunca ganha
  // sessão, mesmo com senha correta — vale também para TESTE, que é um
  // corretor de verdade. Mesmo InvalidCredentialsError genérico de
  // sempre — não revela a um atacante que testou um identificador que a
  // conta existe e está suspensa, em vez de simplesmente não existir ou
  // ter senha errada.
  const brokerBlocked = broker && BLOCKED_LOGIN_STATUSES.includes(broker.status);
  // Defensivo: só dispara se um registro login-special/teste.json apontar
  // para um brokerId que não existe mais (inconsistência de dados) — nunca
  // para MASTER, que nunca tem brokerId.
  const brokerMissing = Boolean(authRecord?.brokerId) && !broker;

  if (!authRecord || !passwordOk || brokerBlocked || brokerMissing) {
    throw new InvalidCredentialsError();
  }

  const claims = {
    userId: authRecord.userId,
    ...(broker ? { brokerId: broker.brokerId, slug: broker.slug } : {}),
    role: authRecord.role,
    authVersion: authRecord.authVersion,
  };

  const token = await createSessionToken(claims, sessionSecret);
  return { token, claims, broker };
}
