// business/auth.js
//
// Private auth-identity domain (§26-§28, Etapa 4 — §90). Owns the
// authoritative credential record in R2 PRIVATE (`auth/{userId}.json`,
// `storage/keys.js#privateKeys.authUser`) — deliberately separate from
// `business/brokers.js`'s broker profile (`brokers/{brokerId}/profile-draft.json`,
// schema `additionalProperties: false`, no room for a passwordHash there).
//
// Login needs both halves of the identity (§26 "resolve índice privado →
// carrega auth object → verifica passwordHash"):
//   - business/brokers.getBrokerByEmail  -> broker/tenant context
//     (brokerId, slug) via the broker-email index (§29/§55; already built
//     in Etapa 3, not part of this lot).
//   - getAuthUser (this file)             -> passwordHash/role/authVersion
//     via `auth/{userId}.json`, keyed off the broker's own `userId`.
//
// Every failure path — unknown e-mail, missing credential record, wrong
// password — throws the same InvalidCredentialsError with the same message,
// per the "resposta genérica" requirement (§26): the caller must never be
// able to tell which half failed.

import { getPrivate, putPrivate } from "../storage/private.js";
import { privateKeys } from "../storage/keys.js";
import { hashPassword, verifyPassword } from "../core/auth.js";
import { createSessionToken } from "../core/session.js";
import { isNonEmptyString, isEmail, isEnum, ValidationError } from "../core/validation.js";
import { getBrokerByEmail } from "./brokers.js";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("E-mail ou senha inválidos.");
    this.name = "InvalidCredentialsError";
  }
}

// Only "broker" is ever minted by this lot's code path (via setAuthPassword
// below, called for accounts business/brokers.createBroker already created).
// "superadmin" is accepted by the type so `auth/{userId}.json` can hold a
// manually-provisioned admin identity ahead of Etapa 8, but nothing here
// creates one.
const ROLES = ["broker", "superadmin"];

// A syntactically valid (but never-used-for-a-real-account) hash, computed
// once per process and reused as the right-hand side of verifyPassword when
// no real credential record exists. Without this, `login` would return
// after a plain object lookup for an unknown e-mail and skip the PBKDF2
// derivation entirely — a timing difference an attacker could use to probe
// which e-mails exist, even though the *response* never reveals it.
let dummyHashPromise;
function getDummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("dummy-password-never-assigned");
  }
  return dummyHashPromise;
}

/** Reads the private credential record for `userId`. Returns `null` if absent. */
export async function getAuthUser(env, userId) {
  if (!isNonEmptyString(userId)) return null;
  return getPrivate(env, privateKeys.authUser(userId));
}

/**
 * Creates or updates the credential half of `userId`'s identity: hashes
 * `password` via core/auth.js (never stores/logs plaintext, §27) and bumps
 * `authVersion`. This is not a signup flow — the broker/business profile is
 * created separately by `business/brokers.createBroker`; this only ever
 * touches `auth/{userId}.json`, which createBroker never receives or writes
 * (it takes no password field at all).
 */
export async function setAuthPassword(env, userId, password, { role = "broker" } = {}) {
  if (!isNonEmptyString(userId)) {
    throw new ValidationError([{ field: "userId", message: "obrigatório" }]);
  }
  if (!isEnum(role, ROLES)) {
    throw new ValidationError([{ field: "role", message: "valor inválido" }]);
  }

  const current = await getAuthUser(env, userId);
  const passwordHash = await hashPassword(password);

  const record = {
    schemaVersion: 1,
    userId,
    role: current?.role ?? role,
    passwordHash,
    authVersion: (current?.authVersion ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };

  await putPrivate(env, privateKeys.authUser(userId), record);
  return record;
}

/**
 * Verifies e-mail + senha and issues a signed session token (§26, §28).
 * Throws `InvalidCredentialsError` uniformly — see module docstring.
 */
export async function login(env, { email, password } = {}, secret) {
  if (!isEmail(email) || !isNonEmptyString(password)) {
    throw new InvalidCredentialsError();
  }

  const broker = await getBrokerByEmail(env, email);
  const authUser = broker ? await getAuthUser(env, broker.userId) : null;

  const storedHash = authUser?.passwordHash ?? (await getDummyHash());
  const passwordOk = await verifyPassword(password, storedHash);

  if (!broker || !authUser || !passwordOk) {
    throw new InvalidCredentialsError();
  }

  const claims = {
    userId: broker.userId,
    brokerId: broker.brokerId,
    slug: broker.slug,
    role: authUser.role,
    authVersion: authUser.authVersion,
  };

  const token = await createSessionToken(claims, secret);
  return { token, claims, broker };
}
