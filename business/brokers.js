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
  nextBrokerSequence,
} from "../storage/indexes.js";
import {
  isNonEmptyString,
  isSlug,
  isEmail,
  isCpf,
  normalizeCpf,
  isUrl,
  isEnum,
  isZipcode,
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

const BROKER_STATUSES = ["pending", "active", "suspended", "disabled", "deleted"];

// §27 hotfix pt.2 — never let a real broker register a slug that collides
// with the special-identifier allowlist (business/auth.js#SPECIAL_IDENTIFIERS
// — "MASTER"/"TESTE"). CPF can't collide structurally (normalizeCpf strips
// letters, so "MASTER"/"TESTE" can never become an 11-digit CPF in the
// first place), but slug has no such built-in protection.
const RESERVED_SLUGS = ["master", "teste"];

// Fields a caller may set on creation. `brokerId` is intentionally absent —
// it is always minted or supplied as an explicit argument, never picked out
// of this object.
//
// Gestão completa de cliente/site: cliente (dados privados) e site (dados
// públicos) são sempre a mesma entidade (1:1) — o corretor tem um único
// registro com os dois grupos de campos lado a lado, só separados na hora
// de publicar (`business/publishing.js#normalizeBrokerForPublic` decide o
// que atravessa pro público). `fullName`/`birthDate`/`nationality`/
// `personalAddress` são a identidade legal privada do cliente — nunca
// confundir com `name` (nome de exibição público do site, já existente).
// `businessPhone`/`businessEmail`/`businessAddress` são os dados de
// contato públicos do site — distintos de `phone`/`email`, que continuam
// existindo só como contato privado do cliente (nunca publicados, ver
// `normalizeBrokerForPublic`).
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
  // Cliente (privado)
  "fullName",
  "birthDate",
  "nationality",
  "personalAddress",
  // Site (público)
  "businessPhone",
  "businessEmail",
  "businessAddress",
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
  "fullName",
  "birthDate",
  "nationality",
  "personalAddress",
  "businessPhone",
  "businessEmail",
  "businessAddress",
];

/**
 * Endereço completo (pessoal ou comercial) — mesma convenção de validação
 * já usada para os campos de endereço do imóvel (business/listings.js:
 * `isNonEmptyString` com `maxLength` por subcampo, `isZipcode` para o CEP),
 * aplicada a um objeto em vez de campos soltos porque aqui os dois
 * endereços (pessoal/comercial) precisam viver lado a lado no mesmo
 * registro sem colidir nomes de campo. `complement` é o único subcampo
 * opcional (nem todo endereço tem complemento).
 */
function isValidAddress(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { country, state, city, street, streetNumber, complement, zipcode } = value;
  if (!isNonEmptyString(country, { maxLength: 60 })) return false;
  if (!isNonEmptyString(state, { maxLength: 60 })) return false;
  if (!isNonEmptyString(city, { maxLength: 120 })) return false;
  if (!isNonEmptyString(street, { maxLength: 200 })) return false;
  if (!isNonEmptyString(streetNumber, { maxLength: 20 })) return false;
  if (complement !== undefined && complement !== null && !isNonEmptyString(complement, { maxLength: 200 })) return false;
  if (!isZipcode(zipcode)) return false;
  return true;
}

/**
 * `birthDate` — ISO date ("YYYY-MM-DD"), nunca no futuro. Teto DINÂMICO
 * (a data/hora atual, não um ano fixo), mesmo espírito de
 * `business/listings.js#isValidYearBuilt`.
 */
function isValidBirthDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = new Date(`${value}T00:00:00Z`).getTime();
  if (Number.isNaN(time)) return false;
  return time <= Date.now();
}

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
  fullName: (v) => isNonEmptyString(v, { maxLength: 200 }),
  birthDate: isValidBirthDate,
  nationality: (v) => isNonEmptyString(v, { maxLength: 60 }),
  personalAddress: isValidAddress,
  businessPhone: (v) => isNonEmptyString(v, { maxLength: 40 }),
  businessEmail: isEmail,
  businessAddress: isValidAddress,
};

/**
 * Mints the next sequential brokerId: `broker_000001`, `broker_000002`, ...
 * — replaces the old `broker_${crypto.randomUUID()}` scheme. One id serves
 * as both the client's id AND the site's id (they're the same 1:1 entity) —
 * never mint a second number for the site. Best-effort (see
 * `storage/indexes.js#nextBrokerSequence`'s docstring for the accepted
 * race) — fine given how rarely a broker is created.
 *
 * Existing `broker_<uuid>` ids from before this change are left exactly as
 * they are (never migrated/renamed) — every lookup here works off the
 * brokerId string itself, never assumes a particular format, so old and
 * new ids coexist without conflict.
 */
async function newBrokerId(env) {
  const sequence = await nextBrokerSequence(env);
  return `broker_${String(sequence).padStart(6, "0")}`;
}

/**
 * Derives a userId from a freshly minted sequential brokerId
 * (`broker_000001` -> `user_000001`) for a caller that didn't supply its
 * own `userId` — the common case for the SuperAdmin "criar cliente/site"
 * flow (worker/admin.js), which never asks for a separate userId. Falls
 * back to a random id for anything that isn't the new sequential shape
 * (an explicit custom `brokerId` passed by a caller) so this never mints a
 * colliding/malformed userId.
 */
function deriveUserId(brokerId) {
  const match = /^broker_(\d{6})$/.exec(brokerId);
  return match ? `user_${match[1]}` : `user_${crypto.randomUUID()}`;
}

/**
 * Creates a new broker record (§29). Returns the private profile object.
 *
 * `cpf` is required (§27 hotfix): it is now the broker's sole login
 * identifier (business/auth.js#login), so a broker created without one
 * could never authenticate. Stored normalized (digits only) — never the
 * raw/formatted input the caller sent.
 *
 * `loginIndexSecret` must be the live LOGIN_INDEX_SECRET (§27 hotfix pt.3
 * — keys the email/CPF index hashes, see storage/indexes.js). `allowMissingCpf`
 * is a narrow escape hatch for `business/auth.js#provisionSpecialAccount`
 * to provision the TESTE special account's broker record (§27 hotfix pt.2
 * — "sem CPF").
 *
 * `userId` is optional: the SuperAdmin "criar cliente/site" flow
 * (worker/admin.js#handleCreateBroker) never collects one — when omitted,
 * it's derived from the freshly minted sequential `brokerId` (see
 * `deriveUserId` above). Passing an explicit `userId` (bootstrap scripts,
 * tests) still works exactly as before.
 */
export async function createBroker(env, input, { loginIndexSecret, allowMissingCpf = false } = {}) {
  const picked = assertValid(input, CREATE_ALLOWED_FIELDS, FIELD_RULES, {
    required: ["slug", "name", "plan", ...(allowMissingCpf ? [] : ["cpf"])],
  });

  const brokerId = isNonEmptyString(input?.brokerId) ? input.brokerId : await newBrokerId(env);
  const userId = isNonEmptyString(picked.userId) ? picked.userId : deriveUserId(brokerId);
  const cpf = picked.cpf !== undefined ? normalizeCpf(picked.cpf) : null;

  if ((cpf || picked.email) && !isNonEmptyString(loginIndexSecret)) {
    throw new ValidationError([{ field: "loginIndexSecret", message: "obrigatório para indexar cpf/email" }]);
  }

  if (RESERVED_SLUGS.includes(picked.slug.toLowerCase())) {
    throw new BrokerConflictError(`Slug "${picked.slug}" é reservado.`);
  }

  const existingSlugOwner = await resolveSlug(env, picked.slug);
  if (existingSlugOwner) {
    throw new BrokerConflictError(`Slug "${picked.slug}" já está em uso.`);
  }
  if (picked.email) {
    const existingEmailOwner = await resolveBrokerByEmail(env, picked.email, loginIndexSecret);
    if (existingEmailOwner) {
      throw new BrokerConflictError(`E-mail "${picked.email}" já está em uso.`);
    }
  }
  if (cpf) {
    const existingCpfOwner = await resolveBrokerByCpf(env, cpf, loginIndexSecret);
    if (existingCpfOwner) {
      // Generic message — never echo the CPF back (§79 "CPF integral" never logged/exposed).
      throw new BrokerConflictError("CPF já cadastrado.");
    }
  }

  const now = new Date().toISOString();
  const broker = {
    schemaVersion: 1,
    brokerId,
    userId,
    slug: picked.slug,
    status: picked.status ?? "pending",
    plan: picked.plan,
    name: sanitizeText(picked.name),
    ...(cpf !== null ? { cpf } : {}),
    ...(picked.email !== undefined ? { email: picked.email } : {}),
    ...(picked.creci !== undefined ? { creci: picked.creci } : {}),
    ...(picked.phone !== undefined ? { phone: picked.phone } : {}),
    ...(picked.whatsapp !== undefined ? { whatsapp: picked.whatsapp } : {}),
    ...(picked.city !== undefined ? { city: picked.city } : {}),
    ...(picked.about !== undefined ? { about: sanitizeText(picked.about) } : {}),
    ...(picked.logo !== undefined ? { logo: picked.logo } : {}),
    ...(picked.cover !== undefined ? { cover: picked.cover } : {}),
    ...(picked.modules !== undefined ? { modules: picked.modules } : {}),
    // Cliente (privado)
    ...(picked.fullName !== undefined ? { fullName: sanitizeText(picked.fullName) } : {}),
    ...(picked.birthDate !== undefined ? { birthDate: picked.birthDate } : {}),
    ...(picked.nationality !== undefined ? { nationality: sanitizeText(picked.nationality) } : {}),
    ...(picked.personalAddress !== undefined ? { personalAddress: picked.personalAddress } : {}),
    // Site (público)
    ...(picked.businessPhone !== undefined ? { businessPhone: picked.businessPhone } : {}),
    ...(picked.businessEmail !== undefined ? { businessEmail: picked.businessEmail } : {}),
    ...(picked.businessAddress !== undefined ? { businessAddress: picked.businessAddress } : {}),
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
    await setBrokerEmailIndex(env, broker.email, brokerId, loginIndexSecret);
  }
  if (broker.cpf) {
    await setBrokerCpfIndex(env, broker.cpf, brokerId, loginIndexSecret);
  }
  await registerBrokerId(env, brokerId);

  return broker;
}

/**
 * Updates an existing broker's profile fields. `brokerId` is a mandatory
 * positional argument resolved by the caller from the session/tenant, never
 * from `patch` (§55) — the allowlist above also guarantees `patch.brokerId`
 * or `patch.userId`, if present, are silently dropped rather than trusted.
 */
export async function updateBrokerProfile(env, brokerId, patch, { loginIndexSecret } = {}) {
  if (!isNonEmptyString(brokerId)) {
    throw new ValidationError([{ field: "brokerId", message: "obrigatório" }]);
  }

  const current = await getBrokerById(env, brokerId);
  if (!current) {
    throw new BrokerNotFoundError(brokerId);
  }

  const picked = assertValid(patch, PROFILE_UPDATE_ALLOWED_FIELDS, FIELD_RULES);
  if (picked.cpf !== undefined) picked.cpf = normalizeCpf(picked.cpf);

  const emailChanged = picked.email !== undefined && picked.email !== current.email;
  const cpfChanged = picked.cpf !== undefined && picked.cpf !== current.cpf;
  if ((emailChanged || cpfChanged) && !isNonEmptyString(loginIndexSecret)) {
    throw new ValidationError([{ field: "loginIndexSecret", message: "obrigatório para reindexar cpf/email" }]);
  }

  if (emailChanged) {
    const emailOwner = await resolveBrokerByEmail(env, picked.email, loginIndexSecret);
    if (emailOwner && emailOwner.brokerId !== brokerId) {
      throw new BrokerConflictError(`E-mail "${picked.email}" já está em uso.`);
    }
  }

  if (cpfChanged) {
    const cpfOwner = await resolveBrokerByCpf(env, picked.cpf, loginIndexSecret);
    if (cpfOwner && cpfOwner.brokerId !== brokerId) {
      throw new BrokerConflictError("CPF já cadastrado.");
    }
  }

  if (picked.name !== undefined) picked.name = sanitizeText(picked.name);
  if (picked.about !== undefined) picked.about = sanitizeText(picked.about);
  if (picked.fullName !== undefined) picked.fullName = sanitizeText(picked.fullName);
  if (picked.nationality !== undefined) picked.nationality = sanitizeText(picked.nationality);

  const updated = {
    ...current,
    ...picked,
    updatedAt: new Date().toISOString(),
  };

  await putPrivate(env, privateKeys.brokerProfileDraft(brokerId), updated);

  if (emailChanged) {
    if (current.email) await deleteBrokerEmailIndex(env, current.email, loginIndexSecret);
    await setBrokerEmailIndex(env, picked.email, brokerId, loginIndexSecret);
  }
  if (cpfChanged) {
    if (current.cpf) await deleteBrokerCpfIndex(env, current.cpf, loginIndexSecret);
    await setBrokerCpfIndex(env, picked.cpf, brokerId, loginIndexSecret);
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
export async function getBrokerByEmail(env, email, loginIndexSecret) {
  if (!isEmail(email)) return null;
  const resolved = await resolveBrokerByEmail(env, email, loginIndexSecret);
  if (!resolved) return null;
  return getBrokerById(env, resolved.brokerId);
}

/**
 * Resolves a CPF to its broker profile via the broker-CPF index (§26). §27
 * hotfix: this is what `business/auth.js#login` now calls to turn the
 * login identifier into tenant context — mirrors `getBrokerByEmail` above
 * exactly, on the field that actually gates login.
 */
export async function getBrokerByCpf(env, cpf, loginIndexSecret) {
  if (!isCpf(cpf)) return null;
  const resolved = await resolveBrokerByCpf(env, normalizeCpf(cpf), loginIndexSecret);
  if (!resolved) return null;
  return getBrokerById(env, resolved.brokerId);
}

// --- SuperAdmin: aprovação/suspensão/reativação (§53, Etapa 8) ------------
//
// A broker's private status is the single authoritative flag both login
// (business/auth.js#login) and the publisher (business/publishing.js —
// broker-suspension cascades onto its listings) read. Transitions are
// intentionally narrow: the 3 moves §53 originally named ("aprovar",
// "suspender", "reativar") plus "excluir" (gestão completa de
// cliente/site) — a logical delete, never a physical one (no code path
// anywhere deletes the private profile-draft/manifest objects or the
// public profile.json; "deleted" is just another value of this same
// status field). "disabled" (present in BROKER_STATUSES/the schema enum
// since an earlier etapa) has no admin action wired to it in this lot —
// see the PR's pendências.

export class BrokerStatusError extends BrokerConflictError {}

const STATUS_TRANSITIONS = {
  approve: { from: ["pending"], to: "active" },
  // A pending signup can also be suspended directly (e.g. an admin blocking
  // an obviously fraudulent cadastro before ever approving it) — not just an
  // already-active broker.
  suspend: { from: ["active", "pending"], to: "suspended" },
  reactivate: { from: ["suspended"], to: "active" },
  // Terminal by design — no move ever transitions a broker back out of
  // "deleted" (there is no "undelete" action). The brokerId itself is
  // never reused afterwards either, but that's already guaranteed for
  // free: the sequential counter behind `newBrokerId` never goes
  // backwards, so no later `createBroker` call can ever mint it again.
  delete: { from: ["pending", "active", "suspended", "disabled"], to: "deleted" },
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
 * pending/active/suspended/disabled -> deleted — exclusão LÓGICA do
 * cliente/site (gestão completa de cliente/site no painel do SuperAdmin).
 * Never a physical delete: this only flips `status`, exactly like
 * approve/suspend/reactivate above — the private profile-draft/manifest
 * and the public profile.json (if it exists) are left in place. The
 * caller (worker/admin.js#handleDeleteBroker) republishes the broker/its
 * listings afterwards, the same way suspend/reactivate already do, so the
 * public footprint collapses to the same minimal, no-real-data
 * publication a suspended broker gets (business/publishing.js —
 * `deleted` maps to the same public "suspended" status suspended/disabled
 * already do, since broker-public.schema.json has no separate enum value
 * for it).
 */
export async function deleteBroker(env, brokerId) {
  return transitionBrokerStatus(env, brokerId, "delete");
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
