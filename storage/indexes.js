// storage/indexes.js
//
// Deterministic lookup helpers over R2 PRIVATE indexes (§23, §26). The rule
// this file exists to enforce: "Não varrer objetos" — login, slug, and
// broker→listing lookups must always be a single keyed `get`, never a
// `list()` scan across the bucket.

import { privateKeys } from "./keys.js";
import { getPrivate, putPrivate, deletePrivate } from "./private.js";

// §27 hotfix pt.3 — was plain SHA-256 (no secret): brute-forceable for a
// small identifier space like CPF (~10^8 checksum-valid values), since
// anyone with read access to R2 PRIVATE could hash every possible CPF and
// match it against `indexes/broker-cpfs/*` without ever touching the
// Worker. HMAC-SHA256 with LOGIN_INDEX_SECRET (provisioned via
// `wrangler secret put LOGIN_INDEX_SECRET`, `wrangler secret put
// PASSWORD_PEPPER`-style) makes that infeasible without the secret.
// Deliberately a different secret than PASSWORD_PEPPER — different job
// (this one protects the *lookup index*, not the password verifier), so
// rotating one never forces rotating the other.
//
// Exported (Etapa 9, §43, módulo saved-search): `modules/saved-search/
// service.js` reuses this exact primitive, keyed by its own
// SAVED_SEARCH_TOKEN_SECRET, to hash the visitor IP behind the anti-abuse
// rate limit — a disjoint message-space prefix (`saved-search-ip:...`
// vs. a bare login identifier) makes secret reuse across purposes safe,
// same reasoning already used by core/auth.js#hmac for PASSWORD_PEPPER.
export async function hmacSha256Hex(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Identifiers are matched case-insensitively; never store the raw value as a key. `secret` must be the live LOGIN_INDEX_SECRET. */
export async function loginIdentifierHash(login, secret) {
  const normalized = String(login).trim().toLowerCase();
  return hmacSha256Hex(normalized, secret);
}

// --- login index: loginHash -> { userId } --------------------------------

export async function resolveLogin(env, login, secret) {
  const hash = await loginIdentifierHash(login, secret);
  return getPrivate(env, privateKeys.loginIndex(hash));
}

export async function setLoginIndex(env, login, userId, secret) {
  const hash = await loginIdentifierHash(login, secret);
  return putPrivate(env, privateKeys.loginIndex(hash), { userId });
}

export async function deleteLoginIndex(env, login, secret) {
  const hash = await loginIdentifierHash(login, secret);
  return deletePrivate(env, privateKeys.loginIndex(hash));
}

// --- slug index: slug -> { type, id } -------------------------------------
// `type` is "broker" or "listing" — kept in the value, not the key, so both
// namespaces can share one flat `indexes/slugs/` prefix per §23.

export async function resolveSlug(env, slug) {
  return getPrivate(env, privateKeys.slugIndex(slug));
}

export async function setSlugIndex(env, slug, type, id) {
  return putPrivate(env, privateKeys.slugIndex(slug), { type, id });
}

export async function deleteSlugIndex(env, slug) {
  return deletePrivate(env, privateKeys.slugIndex(slug));
}

// --- broker email index: emailHash -> { brokerId } ------------------------
// Distinct from the login index above: the login index resolves an auth
// identity (email -> userId, for Etapa 4's credential check), while this
// resolves a broker's own contact email straight to its brokerId, which is
// what business/brokers.js#getBrokerByEmail needs (§29) without touching
// auth/session concerns.

export async function resolveBrokerByEmail(env, email, secret) {
  const hash = await loginIdentifierHash(email, secret);
  return getPrivate(env, privateKeys.brokerEmailIndex(hash));
}

export async function setBrokerEmailIndex(env, email, brokerId, secret) {
  const hash = await loginIdentifierHash(email, secret);
  return putPrivate(env, privateKeys.brokerEmailIndex(hash), { brokerId });
}

export async function deleteBrokerEmailIndex(env, email, secret) {
  const hash = await loginIdentifierHash(email, secret);
  return deletePrivate(env, privateKeys.brokerEmailIndex(hash));
}

// --- broker CPF index: cpfHash -> { brokerId } -----------------------------
// §27 hotfix: CPF is the broker login identifier (browser-side PBKDF2),
// resolved by business/brokers.js#getBrokerByCpf. Mirrors the broker-email
// index above exactly, on a different field. Callers are expected to pass
// an already-normalized (digits-only) CPF — this file stays identifier-
// agnostic, same as loginIdentifierHash itself.

export async function resolveBrokerByCpf(env, cpf, secret) {
  const hash = await loginIdentifierHash(cpf, secret);
  return getPrivate(env, privateKeys.brokerCpfIndex(hash));
}

export async function setBrokerCpfIndex(env, cpf, brokerId, secret) {
  const hash = await loginIdentifierHash(cpf, secret);
  return putPrivate(env, privateKeys.brokerCpfIndex(hash), { brokerId });
}

export async function deleteBrokerCpfIndex(env, cpf, secret) {
  const hash = await loginIdentifierHash(cpf, secret);
  return deletePrivate(env, privateKeys.brokerCpfIndex(hash));
}

// --- special-identifier login: kind -> credential record -------------------
// §27 hotfix pt.2 — MASTER/TESTE (business/auth.js#SPECIAL_IDENTIFIERS).
// `kind` is always the literal "master" or "teste", never hashed (see
// storage/keys.js#privateKeys.loginSpecial for why).

export async function resolveSpecialLogin(env, kind) {
  return getPrivate(env, privateKeys.loginSpecial(kind));
}

export async function setSpecialLogin(env, kind, record) {
  return putPrivate(env, privateKeys.loginSpecial(kind), record);
}

// --- broker -> listingIds index -------------------------------------------

export async function getBrokerListingIds(env, brokerId) {
  const index = await getPrivate(env, privateKeys.brokerListingsIndex(brokerId));
  return index?.listingIds ?? [];
}

export async function addBrokerListingId(env, brokerId, listingId) {
  const listingIds = await getBrokerListingIds(env, brokerId);
  if (!listingIds.includes(listingId)) {
    listingIds.push(listingId);
    await putPrivate(env, privateKeys.brokerListingsIndex(brokerId), { listingIds });
  }
  return listingIds;
}

export async function removeBrokerListingId(env, brokerId, listingId) {
  const listingIds = (await getBrokerListingIds(env, brokerId)).filter((id) => id !== listingId);
  await putPrivate(env, privateKeys.brokerListingsIndex(brokerId), { listingIds });
  return listingIds;
}

// --- city -> listingIds index (Etapa 6, §33) ------------------------------
// Mirrors the broker -> listingIds index above, but scoped to a city: lets
// `rebuildCity` enumerate every listing ever published under that city
// without scanning `listings/` (§26). Membership here means "this listing
// has been published (or removed/sold-published) under this city at least
// once" — it is never pruned, so a rebuild can still see a listing that is
// currently inactive/sold/removed and correctly exclude it from the shard.

export async function getCityListingIds(env, citySlug) {
  const index = await getPrivate(env, privateKeys.cityListingsIndex(citySlug));
  return index?.listingIds ?? [];
}

export async function addCityListingId(env, citySlug, listingId) {
  const listingIds = await getCityListingIds(env, citySlug);
  if (!listingIds.includes(listingId)) {
    listingIds.push(listingId);
    await putPrivate(env, privateKeys.cityListingsIndex(citySlug), { listingIds });
  }
  return listingIds;
}

export async function removeCityListingId(env, citySlug, listingId) {
  const listingIds = (await getCityListingIds(env, citySlug)).filter((id) => id !== listingId);
  await putPrivate(env, privateKeys.cityListingsIndex(citySlug), { listingIds });
  return listingIds;
}

// --- city registry (Etapa 6, §34) -----------------------------------------
// Every city slug that has ever had a listing published, so `rebuildAll`
// can enumerate "all cities" without scanning `indexes/cities/` (§26).
// Grows monotonically — a city with zero active listings still publishes a
// valid empty manifest (§77), so there is no need to ever remove a slug.

export async function getKnownCitySlugs(env) {
  const registry = await getPrivate(env, privateKeys.cityRegistry());
  return registry?.citySlugs ?? [];
}

export async function registerCitySlug(env, citySlug) {
  const citySlugs = await getKnownCitySlugs(env);
  if (!citySlugs.includes(citySlug)) {
    citySlugs.push(citySlug);
    citySlugs.sort();
    await putPrivate(env, privateKeys.cityRegistry(), { citySlugs });
  }
  return citySlugs;
}

// --- broker registry (Etapa 8, §53) ---------------------------------------
// Every brokerId ever created, so SuperAdmin's broker list can enumerate all
// brokers (any status) without scanning `brokers/` (§26). Grows
// monotonically, same rationale as the city registry above.

export async function getKnownBrokerIds(env) {
  const registry = await getPrivate(env, privateKeys.brokerRegistry());
  return registry?.brokerIds ?? [];
}

export async function registerBrokerId(env, brokerId) {
  const brokerIds = await getKnownBrokerIds(env);
  if (!brokerIds.includes(brokerId)) {
    brokerIds.push(brokerId);
    await putPrivate(env, privateKeys.brokerRegistry(), { brokerIds });
  }
  return brokerIds;
}

// --- broker id sequence (gestão completa de cliente/site) -----------------
// Backs `business/brokers.js#newBrokerId`: a plain read-increment-write
// counter, same best-effort shape as `modules/saved-search/service.js#
// enforceRateLimit` and `worker/bootstrap.js#withinRateLimit` — R2 has no
// atomic increment/conditional PUT, so two `createBroker` calls landing in
// the same instant could both read the same `lastValue` and mint the same
// next id. Accepted here for the same reason those two counters accept it:
// broker creation is a rare, admin-driven action, nowhere near frequent
// enough for the race window to matter in practice. A collision would
// surface as a downstream conflict (whatever write hits the duplicate
// brokerId first), never silent data loss.

export async function nextBrokerSequence(env) {
  const key = privateKeys.brokerIdCounter();
  const counter = await getPrivate(env, key);
  const next = (counter?.lastValue ?? 0) + 1;
  await putPrivate(env, key, { lastValue: next });
  return next;
}

// --- plan registry (Etapa 8b, §52/§53) ------------------------------------
// Every planId ever created, so SuperAdmin's plan catalog listing can
// enumerate all plans without scanning `plans/` (§26). Mirrors the broker
// registry above, except this one IS pruned by `deletePlan` (a removed plan
// should stop showing up in the catalog — unlike a broker/city, a plan has
// no historical public footprint that needs the id to keep resolving).

export async function getKnownPlanIds(env) {
  const registry = await getPrivate(env, privateKeys.planRegistry());
  return registry?.planIds ?? [];
}

export async function registerPlanId(env, planId) {
  const planIds = await getKnownPlanIds(env);
  if (!planIds.includes(planId)) {
    planIds.push(planId);
    planIds.sort();
    await putPrivate(env, privateKeys.planRegistry(), { planIds });
  }
  return planIds;
}

export async function deregisterPlanId(env, planId) {
  const planIds = (await getKnownPlanIds(env)).filter((id) => id !== planId);
  await putPrivate(env, privateKeys.planRegistry(), { planIds });
  return planIds;
}

// --- saved-search city index (Etapa 9, §43, módulo saved-search) ----------
// savedSearchIds with a CONFIRMED, still-subscribed alert for a city.
// Populated on confirm, pruned on unsubscribe — unlike the registries
// above (city/broker/plan), membership here is NOT permanent: an
// unsubscribed search must actually stop matching future listings, so it
// is removed rather than just marked inactive in place.

export async function getSavedSearchIdsForCity(env, citySlug) {
  const index = await getPrivate(env, privateKeys.savedSearchCityIndex(citySlug));
  return index?.savedSearchIds ?? [];
}

export async function addSavedSearchToCityIndex(env, citySlug, savedSearchId) {
  const savedSearchIds = await getSavedSearchIdsForCity(env, citySlug);
  if (!savedSearchIds.includes(savedSearchId)) {
    savedSearchIds.push(savedSearchId);
    await putPrivate(env, privateKeys.savedSearchCityIndex(citySlug), { savedSearchIds });
  }
  return savedSearchIds;
}

export async function removeSavedSearchFromCityIndex(env, citySlug, savedSearchId) {
  const savedSearchIds = (await getSavedSearchIdsForCity(env, citySlug)).filter((id) => id !== savedSearchId);
  await putPrivate(env, privateKeys.savedSearchCityIndex(citySlug), { savedSearchIds });
  return savedSearchIds;
}

// --- financial broker->chargeIds index (Etapa 10, §51, módulo financial) -
// Every chargeId ever created for a broker, mirrors `getBrokerListingIds`
// above — lets the painel's "financeiro" area list a broker's charges
// without scanning `financial/charges/` (§26). Never pruned (a charge's own
// `status` field tracks its lifecycle, same as listings keep a "removed"
// status rather than disappearing from this kind of index).

export async function getFinancialChargeIdsForBroker(env, brokerId) {
  const index = await getPrivate(env, privateKeys.financialBrokerChargesIndex(brokerId));
  return index?.chargeIds ?? [];
}

export async function addFinancialChargeToBrokerIndex(env, brokerId, chargeId) {
  const chargeIds = await getFinancialChargeIdsForBroker(env, brokerId);
  if (!chargeIds.includes(chargeId)) {
    chargeIds.push(chargeId);
    await putPrivate(env, privateKeys.financialBrokerChargesIndex(brokerId), { chargeIds });
  }
  return chargeIds;
}
