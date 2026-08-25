// business/brokers.js
//
// Private broker domain (§29, Etapa 3 — §90). Owns the authoritative broker
// record in R2 PRIVATE (`brokers/{brokerId}/*`) plus the private indexes
// that resolve a broker by slug, e-mail, or CPF without ever scanning the
// bucket (§26). Deliberately does NOT touch auth: no password hashing,
// login, or session — that is business/auth.js (§27-§28). `getBrokerByCpf`
// exists here only because business/auth.js#login needs to turn CPF (the
// login identifier as of the §27 browser-PBKDF2 hotfix) into a broker/
// tenant context; `getBrokerByEmail` stays for e-mail as a contact field,
// unrelated to login.
//
// Multitenancy (§55): every write here scopes itself to a `brokerId` the
// caller passes in explicitly — never a field read out of the patch/input
// body. `createBroker` mints the id; `updateBrokerProfile` requires it as a
// mandatory positional argument and ignores any `brokerId`/`userId` present
// in the patch (the allowlist below never includes them).

import { getPrivate, putPrivate } from "../storage/private.js";
import { privateKeys } from "../storage/keys.js";
import {
  resolveSlug,
  setSlugIndex,
  resolveBrokerByEmail,
  setBrokerEmailIndex,
  deleteBrokerEmailIndex,
  resolveBrokerByCpf,
  setBrokerCpfIndex,
  deleteBrokerCpfIndex,
  getKnownBrokerIds,
  registerBrokerId,
} from "../storage/indexes.js";
import {
  isNonEmptyString,
  isSlug,
  isEmail,
  isCpf,
  normalizeCpf,
  isUrl,
  isEnum,
  pickAllowed,
  assertValid,
  ValidationError,
} from "../core/validation.js";
import { sanitizeText } from "../core/security.js";

export class BrokerNotFoundError extends Error {
  constructor(brokerId) {
    super(`Corretor "${brokerId}" não encontrado.`);
    this.name = "BrokerNotFoundError";
  }
}

export class BrokerConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "BrokerConflictError";
  }
}

const BROKER_STATUSES = ["pending", "active", "suspended", "disabled"];

// Fields a caller may set on creation. `brokerId` is intentionally absent —
// it is always minted or supplied as an explicit argument, never picked out
// of this object.
const CREATE_ALLOWED_FIELDS = [
  "userId",
  "slug",
  "name",
  "plan",
  "status",
  "email",
  "cpf",
  "creci",
  "phone",
  "whatsapp",
  "city",
  "about",
  "logo",
  "cover",
  "modules",
];

// Fields a broker (or admin, via the same function) may change about an
// existing profile. status/plan/slug/userId are managed elsewhere (§53
// SuperAdmin actions, publishing) and are not part of this allowlist.
const PROFILE_UPDATE_ALLOWED_FIELDS = [
  "name",
  "email",
  "cpf",
  "creci",
  "phone",
  "whatsapp",
  "city",
  "about",
  "logo",
  "cover",
  "modules",
];

const FIELD_RULES = {
  userId: isNonEmptyString,
  slug: isSlug,
  name: (v) => isNonEmptyString(v, { maxLength: 200 }),
  plan: (v) => isNonEmptyString(v, { maxLength: 60 }),
  status: (v) => isEnum(v, BROKER_STATUSES),
  email: isEmail,
  cpf: isCpf,
  creci: (v) => isNonEmptyString(v, { maxLength: 60 }),
  phone: (v) => isNonEmptyString(v, { maxLength: 40 }),
  whatsapp: (v) => isNonEmptyString(v, { maxLength: 40 }),
  city: (v) => isNonEmptyString(v, { maxLength: 120 }),
  about: (v) => isNonEmptyString(v, { maxLength: 5000 }),
  logo: (v) => v === null || isUrl(v),
  cover: (v) => v === null || isUrl(v),
  modules: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
};

function newBrokerId() {
  return `broker_${crypto.randomUUID()}`;
}

/**
 * Creates a new broker record (§29). Returns the private profile object.
 *
 * `cpf` is required (§27 hotfix): it is now the broker's sole login
 * identifier (business/auth.js#login), so a broker created without one
 * could never authenticate. Stored normalized (digits only) — never the
 * raw/formatted input the caller sent.
 */
export async function createBroker(env, input) {
  const picked = assertValid(input, CREATE_ALLOWED_FIELDS, FIELD_RULES, {
    required: ["userId", "slug", "name", "plan", "cpf"],
  });

  const brokerId = isNonEmptyString(input?.brokerId) ? input.brokerId : newBrokerId();
  const cpf = normalizeCpf(picked.cpf);

  const existingSlugOwner = await resolveSlug(env, picked.slug);
  if (existingSlugOwner) {
    throw new BrokerConflictError(`Slug "${picked.slug}" já está em uso.`);
  }
  if (picked.email) {
    const existingEmailOwner = await resolveBrokerByEmail(env, picked.email);
    if (existingEmailOwner) {
      throw new BrokerConflictError(`E-mail "${picked.email}" já está em uso.`);
    }
  }
  const existingCpfOwner = await resolveBrokerByCpf(env, cpf);
  if (existingCpfOwner) {
    // Generic message — never echo the CPF back (§79 "CPF integral" never logged/exposed).
    throw new BrokerConflictError("CPF já cadastrado.");
  }

  const now = new Date().toISOString();
  const broker = {
    schemaVersion: 1,
    brokerId,
    userId: picked.userId,
    slug: picked.slug,
    status: picked.status ?? "pending",
    plan: picked.plan,
    name: sanitizeText(picked.name),
    cpf,
    ...(picked.email !== undefined ? { email: picked.email } : {}),
    ...(picked.creci !== undefined ? { creci: picked.creci } : {}),
    ...(picked.phone !== undefined ? { phone: picked.phone } : {}),
    ...(picked.whatsapp !== undefined ? { whatsapp: picked.whatsapp } : {}),
    ...(picked.city !== undefined ? { city: picked.city } : {}),
    ...(picked.about !== undefined ? { about: sanitizeText(picked.about) } : {}),
    ...(picked.logo !== undefined ? { logo: picked.logo } : {}),
    ...(picked.cover !== undefined ? { cover: picked.cover } : {}),
    ...(picked.modules !== undefined ? { modules: picked.modules } : {}),
    updatedAt: now,
  };

  await putPrivate(env, privateKeys.brokerProfileDraft(brokerId), broker);
  await putPrivate(env, privateKeys.brokerManifest(brokerId), {
    schemaVersion: 1,
    brokerId,
    userId: broker.userId,
    slug: broker.slug,
    status: broker.status,
    plan: broker.plan,
    profileKey: privateKeys.brokerProfileDraft(brokerId),
    publicationVersion: 0,
  });

  await setSlugIndex(env, broker.slug, "broker", brokerId);
  if (broker.email) {
    await setBrokerEmailIndex(env, broker.email, brokerId);
  }
  await setBrokerCpfIndex(env, broker.cpf, brokerId);
  await registerBrokerId(env, brokerId);

  return broker;
}

/**
 * Updates an existing broker's profile fields. `brokerId` is a mandatory
 * positional argument resolved by the caller from the session/tenant, never
 * from `patch` (§55) — the allowlist above also guarantees `patch.brokerId`
 * or `patch.userId`, if present, are silently dropped rather than trusted.
 */
export async function updateBrokerProfile(env, brokerId, patch) {
  if (!isNonEmptyString(brokerId)) {
    throw new ValidationError([{ field: "brokerId", message: "obrigatório" }]);
  }

  const current = await getBrokerById(env, brokerId);
  if (!current) {
    throw new BrokerNotFoundError(brokerId);
  }

  const picked = assertValid(patch, PROFILE_UPDATE_ALLOWED_FIELDS, FIELD_RULES);

  if (picked.email !== undefined && picked.email !== current.email) {
    const emailOwner = await resolveBrokerByEmail(env, picked.email);
    if (emailOwner && emailOwner.brokerId !== brokerId) {
      throw new BrokerConflictError(`E-mail "${picked.email}" já está em uso.`);
    }
  }

  if (picked.cpf !== undefined) picked.cpf = normalizeCpf(picked.cpf);
  if (picked.cpf !== undefined && picked.cpf !== current.cpf) {
    const cpfOwner = await resolveBrokerByCpf(env, picked.cpf);
    if (cpfOwner && cpfOwner.brokerId !== brokerId) {
      throw new BrokerConflictError("CPF já cadastrado.");
    }
  }

  if (picked.name !== undefined) picked.name = sanitizeText(picked.name);
  if (picked.about !== undefined) picked.about = sanitizeText(picked.about);

  const updated = {
    ...current,
    ...picked,
    updatedAt: new Date().toISOString(),
  };

  await putPrivate(env, privateKeys.brokerProfileDraft(brokerId), updated);

  if (picked.email !== undefined && picked.email !== current.email) {
    if (current.email) await deleteBrokerEmailIndex(env, current.email);
    await setBrokerEmailIndex(env, picked.email, brokerId);
  }
  if (picked.cpf !== undefined && picked.cpf !== current.cpf) {
    if (current.cpf) await deleteBrokerCpfIndex(env, current.cpf);
    await setBrokerCpfIndex(env, picked.cpf, brokerId);
  }

  return updated;
}

/** Looks up a broker's private profile by id. Returns `null` if it doesn't exist. */
export async function getBrokerById(env, brokerId) {
  if (!isNonEmptyString(brokerId)) return null;
  return getPrivate(env, privateKeys.brokerProfileDraft(brokerId));
}

/** Resolves a public slug to its broker profile via the shared slug index (§26). */
export async function getBrokerBySlug(env, slug) {
  if (!isSlug(slug)) return null;
  const resolved = await resolveSlug(env, slug);
  if (!resolved || resolved.type !== "broker") return null;
  return getBrokerById(env, resolved.id);
}

/**
 * Resolves an e-mail to its broker profile via the broker-email index (§26).
 * Needed so Etapa 4's login flow can turn a resolved identity into a
 * broker/tenant context — this function does not itself verify credentials.
 */
export async function getBrokerByEmail(env, email) {
  if (!isEmail(email)) return null;
  const resolved = await resolveBrokerByEmail(env, email);
  if (!resolved) return null;
  return getBrokerById(env, resolved.brokerId);
}

/**
 * Resolves a CPF to its broker profile via the broker-CPF index (§26). §27
 * hotfix: this is what `business/auth.js#login` now calls to turn the
 * login identifier into tenant context — mirrors `getBrokerByEmail` above
 * exactly, on the field that actually gates login.
 */
export async function getBrokerByCpf(env, cpf) {
  if (!isCpf(cpf)) return null;
  const resolved = await resolveBrokerByCpf(env, normalizeCpf(cpf));
  if (!resolved) return null;
  return getBrokerById(env, resolved.brokerId);
}

// --- SuperAdmin: aprovação/suspensão/reativação (§53, Etapa 8) ------------
//
// A broker's private status is the single authoritative flag both login
// (business/auth.js#login) and the publisher (business/publishing.js —
// broker-suspension cascades onto its listings) read. Transitions are
// intentionally narrow: only the 3 moves §53 actually names ("aprovar",
// "suspender", "reativar"). "disabled" (present in BROKER_STATUSES/the
// schema enum since an earlier etapa) has no admin action wired to it in
// this lot — see the PR's pendências.

export class BrokerStatusError extends BrokerConflictError {}

const STATUS_TRANSITIONS = {
  approve: { from: ["pending"], to: "active" },
  // A pending signup can also be suspended directly (e.g. an admin blocking
  // an obviously fraudulent cadastro before ever approving it) — not just an
  // already-active broker.
  suspend: { from: ["active", "pending"], to: "suspended" },
  reactivate: { from: ["suspended"], to: "active" },
};

async function transitionBrokerStatus(env, brokerId, action) {
  if (!isNonEmptyString(brokerId)) {
    throw new ValidationError([{ field: "brokerId", message: "obrigatório" }]);
  }
  const { from, to } = STATUS_TRANSITIONS[action];

  const current = await getBrokerById(env, brokerId);
  if (!current) throw new BrokerNotFoundError(brokerId);
  if (!from.includes(current.status)) {
    throw new BrokerStatusError(
      `Corretor "${brokerId}" está "${current.status}" — ação "${action}" requer um dos estados: ${from.join(", ")}.`,
    );
  }

  const updated = { ...current, status: to, updatedAt: new Date().toISOString() };
  await putPrivate(env, privateKeys.brokerProfileDraft(brokerId), updated);

  const manifestKey = privateKeys.brokerManifest(brokerId);
  const manifest = (await getPrivate(env, manifestKey)) ?? {};
  await putPrivate(env, manifestKey, { ...manifest, status: to });

  return updated;
}

/** pending -> active (§53 "aprovar"). */
export async function approveBroker(env, brokerId) {
  return transitionBrokerStatus(env, brokerId, "approve");
}

/** active/pending -> suspended (§53 "suspender"). */
export async function suspendBroker(env, brokerId) {
  return transitionBrokerStatus(env, brokerId, "suspend");
}

/** suspended -> active (§53 "reativar"). */
export async function reactivateBroker(env, brokerId) {
  return transitionBrokerStatus(env, brokerId, "reactivate");
}

/**
 * Lists every known broker (any status), for SuperAdmin's broker list
 * (§53). Uses the broker registry (storage/indexes.js#getKnownBrokerIds) —
 * never a bucket scan (§26). Optionally filters to a single `status`.
 */
export async function listBrokers(env, { status } = {}) {
  const brokerIds = await getKnownBrokerIds(env);
  const brokers = [];
  for (const brokerId of brokerIds) {
    const broker = await getBrokerById(env, brokerId);
    if (!broker) continue; // defensivo — registro órfão não derruba a listagem
    if (status && broker.status !== status) continue;
    brokers.push(broker);
  }
  return brokers;
}
