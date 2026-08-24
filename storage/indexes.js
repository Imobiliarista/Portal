// storage/indexes.js
//
// Deterministic lookup helpers over R2 PRIVATE indexes (§23, §26). The rule
// this file exists to enforce: "Não varrer objetos" — login, slug, and
// broker→listing lookups must always be a single keyed `get`, never a
// `list()` scan across the bucket.

import { privateKeys } from "./keys.js";
import { getPrivate, putPrivate, deletePrivate } from "./private.js";

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Emails are matched case-insensitively; never store the raw address as a key. */
export async function loginIdentifierHash(login) {
  const normalized = String(login).trim().toLowerCase();
  return sha256Hex(normalized);
}

// --- login index: loginHash -> { userId } --------------------------------

export async function resolveLogin(env, login) {
  const hash = await loginIdentifierHash(login);
  return getPrivate(env, privateKeys.loginIndex(hash));
}

export async function setLoginIndex(env, login, userId) {
  const hash = await loginIdentifierHash(login);
  return putPrivate(env, privateKeys.loginIndex(hash), { userId });
}

export async function deleteLoginIndex(env, login) {
  const hash = await loginIdentifierHash(login);
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

export async function resolveBrokerByEmail(env, email) {
  const hash = await loginIdentifierHash(email);
  return getPrivate(env, privateKeys.brokerEmailIndex(hash));
}

export async function setBrokerEmailIndex(env, email, brokerId) {
  const hash = await loginIdentifierHash(email);
  return putPrivate(env, privateKeys.brokerEmailIndex(hash), { brokerId });
}

export async function deleteBrokerEmailIndex(env, email) {
  const hash = await loginIdentifierHash(email);
  return deletePrivate(env, privateKeys.brokerEmailIndex(hash));
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
