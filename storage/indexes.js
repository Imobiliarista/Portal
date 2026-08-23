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
