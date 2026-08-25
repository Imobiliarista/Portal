// business/listings.js
//
// Private listing/draft domain (§30, Etapa 3 — §90). Owns the authoritative
// listing record in R2 PRIVATE (`listings/{listingId}/*`) plus the
// listings-by-broker index used by the painel's "meus imóveis" without
// scanning the bucket (§26). Publishing the draft into a public projection
// (§31) is out of scope here — that's Etapa 6 (business/publishing.js).
//
// Multitenancy (§55): `brokerId` is a mandatory positional argument on
// every write, resolved by the caller from the session/tenant — never a
// field read out of `input`/`patch` (the allowlists below never include
// `brokerId`). `updateListing` additionally re-checks the draft's own
// `brokerId` against the caller-supplied one before writing, so a stale or
// mismatched id can never silently write into another broker's listing.

import { getPrivate, putPrivate } from "../storage/private.js";
import { privateKeys, dataKeys } from "../storage/keys.js";
import {
  resolveSlug,
  setSlugIndex,
  getBrokerListingIds,
  addBrokerListingId,
} from "../storage/indexes.js";
import {
  isNonEmptyString,
  isSlug,
  isEnum,
  isInteger,
  isPositiveNumber,
  isPrice,
  isLatitude,
  isLongitude,
  isZipcode,
  isUrl,
  assertValid,
  ValidationError,
} from "../core/validation.js";
import { sanitizeText } from "../core/security.js";
import { TenantMismatchError } from "../core/tenant.js";
import { getGalleryLimitForBroker } from "./plans.js";

export class ListingNotFoundError extends Error {
  constructor(listingId) {
    super(`Anúncio "${listingId}" não encontrado.`);
    this.name = "ListingNotFoundError";
  }
}

export class ListingConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "ListingConflictError";
  }
}

/**
 * Etapa 8b (§52/§53): the per-listing gallery photo count is no longer a
 * fixed constant here — it's derived from the owning broker's plan (see
 * business/plans.js#getGalleryLimitForBroker, which itself falls back to a
 * seeded default plan for a broker with none assigned). Thrown by
 * createListing/updateListing below whenever a `gallery` patch would push
 * the count past that limit; a 409-style conflict (not ValidationError),
 * matching how worker/uploads.js already treated a full gallery.
 */
export class GalleryLimitExceededError extends ListingConflictError {
  constructor(limit) {
    super(`Limite de ${limit} fotos por anúncio atingido para o plano deste corretor.`);
    this.limit = limit;
  }
}

const LISTING_STATUSES = ["draft", "active", "paused", "sold", "removed"];
const PURPOSES = ["venda", "aluguel"];

function isValidFeatures(value) {
  if (typeof value !== "object" || value === null) return false;
  const { bedrooms, bathrooms, parkingSpaces, area } = value;
  return (
    isInteger(bedrooms) &&
    bedrooms >= 0 &&
    isInteger(bathrooms) &&
    bathrooms >= 0 &&
    isInteger(parkingSpaces) &&
    parkingSpaces >= 0 &&
    isPositiveNumber(area)
  );
}

// Shape-only: every item must be a URL. The *count* limit is no longer a
// static rule here — it depends on the broker's plan (§52/§53), checked
// separately (async) in createListing/updateListing below, after this
// synchronous field-rule pass.
function isValidGallery(value) {
  return Array.isArray(value) && value.every((item) => isUrl(item));
}

function isValidVideo(value) {
  if (value === null) return true;
  return (
    typeof value === "object" &&
    value !== null &&
    value.provider === "youtube" &&
    isNonEmptyString(value.id)
  );
}

function isValidTour360(value) {
  if (value === null) return true;
  return typeof value === "object" && value !== null && isUrl(value.url);
}

// Fields settable at creation. `slug` is create-time only in this lote —
// changing it later would require migrating the slug index and public key,
// which belongs to the publisher (Etapa 6), so it's left out of the update
// allowlist below.
const CREATE_ALLOWED_FIELDS = [
  "city",
  "slug",
  "status",
  "title",
  "description",
  "purpose",
  "type",
  "price",
  "condominium",
  "iptu",
  "district",
  "zipcode",
  "latitude",
  "longitude",
  "features",
  "gallery",
  "video",
  "tour360",
];

const UPDATE_ALLOWED_FIELDS = CREATE_ALLOWED_FIELDS.filter((field) => field !== "slug");

const FIELD_RULES = {
  city: (v) => isNonEmptyString(v, { maxLength: 120 }),
  slug: isSlug,
  status: (v) => isEnum(v, LISTING_STATUSES),
  title: (v) => isNonEmptyString(v, { maxLength: 200 }),
  description: (v) => isNonEmptyString(v, { maxLength: 20000 }),
  purpose: (v) => isEnum(v, PURPOSES),
  type: (v) => isNonEmptyString(v, { maxLength: 60 }),
  price: isPrice,
  condominium: (v) => v === null || isPrice(v),
  iptu: (v) => v === null || isPrice(v),
  district: (v) => isNonEmptyString(v, { maxLength: 120 }),
  zipcode: isZipcode,
  latitude: (v) => v === null || isLatitude(v),
  longitude: (v) => v === null || isLongitude(v),
  features: isValidFeatures,
  gallery: isValidGallery,
  video: isValidVideo,
  tour360: isValidTour360,
};

function newListingId() {
  return `listing_${crypto.randomUUID()}`;
}

/**
 * Creates a new listing draft (§30) owned by `brokerId`. `brokerId` is a
 * mandatory positional argument — never read from `input` (§55).
 */
export async function createListing(env, brokerId, input) {
  if (!isNonEmptyString(brokerId)) {
    throw new ValidationError([{ field: "brokerId", message: "obrigatório" }]);
  }

  const picked = assertValid(input, CREATE_ALLOWED_FIELDS, FIELD_RULES, {
    required: ["city", "slug", "title", "purpose", "type", "price", "features"],
  });

  if (picked.gallery !== undefined) {
    const limit = await getGalleryLimitForBroker(env, brokerId);
    if (picked.gallery.length > limit) {
      throw new GalleryLimitExceededError(limit);
    }
  }

  const listingId = isNonEmptyString(input?.listingId) ? input.listingId : newListingId();

  const existingSlugOwner = await resolveSlug(env, picked.slug);
  if (existingSlugOwner) {
    throw new ListingConflictError(`Slug "${picked.slug}" já está em uso.`);
  }

  const now = new Date().toISOString();
  const draft = {
    schemaVersion: 1,
    listingId,
    brokerId,
    city: picked.city,
    slug: picked.slug,
    status: picked.status ?? "draft",
    title: sanitizeText(picked.title),
    purpose: picked.purpose,
    type: picked.type,
    price: picked.price,
    features: picked.features,
    ...(picked.description !== undefined ? { description: sanitizeText(picked.description) } : {}),
    ...(picked.condominium !== undefined ? { condominium: picked.condominium } : {}),
    ...(picked.iptu !== undefined ? { iptu: picked.iptu } : {}),
    ...(picked.district !== undefined ? { district: picked.district } : {}),
    ...(picked.zipcode !== undefined ? { zipcode: picked.zipcode } : {}),
    ...(picked.latitude !== undefined ? { latitude: picked.latitude } : {}),
    ...(picked.longitude !== undefined ? { longitude: picked.longitude } : {}),
    ...(picked.gallery !== undefined ? { gallery: picked.gallery } : {}),
    ...(picked.video !== undefined ? { video: picked.video } : {}),
    ...(picked.tour360 !== undefined ? { tour360: picked.tour360 } : {}),
    updatedAt: now,
  };

  await putPrivate(env, privateKeys.listingDraft(listingId), draft);
  await putPrivate(env, privateKeys.listingManifest(listingId), {
    schemaVersion: 1,
    listingId,
    brokerId,
    slug: draft.slug,
    city: draft.city,
    status: draft.status,
    draftKey: privateKeys.listingDraft(listingId),
    publicKey: dataKeys.listingPublic(draft.slug),
  });

  await setSlugIndex(env, draft.slug, "listing", listingId);
  await addBrokerListingId(env, brokerId, listingId);

  return draft;
}

/**
 * Updates an existing listing draft. `brokerId` is a mandatory positional
 * argument (§55); the write is rejected with `TenantMismatchError` if the
 * draft's own `brokerId` doesn't match, so a caller can never overwrite
 * another broker's listing even if it mis-resolves an id.
 */
export async function updateListing(env, brokerId, listingId, patch) {
  if (!isNonEmptyString(brokerId)) {
    throw new ValidationError([{ field: "brokerId", message: "obrigatório" }]);
  }
  if (!isNonEmptyString(listingId)) {
    throw new ValidationError([{ field: "listingId", message: "obrigatório" }]);
  }

  const current = await getListingById(env, listingId);
  if (!current) {
    throw new ListingNotFoundError(listingId);
  }
  if (current.brokerId !== brokerId) {
    throw new TenantMismatchError();
  }

  const picked = assertValid(patch, UPDATE_ALLOWED_FIELDS, FIELD_RULES);

  if (picked.gallery !== undefined) {
    const limit = await getGalleryLimitForBroker(env, brokerId);
    if (picked.gallery.length > limit) {
      throw new GalleryLimitExceededError(limit);
    }
  }

  if (picked.title !== undefined) picked.title = sanitizeText(picked.title);
  if (picked.description !== undefined) picked.description = sanitizeText(picked.description);

  const updated = {
    ...current,
    ...picked,
    updatedAt: new Date().toISOString(),
  };

  await putPrivate(env, privateKeys.listingDraft(listingId), updated);

  if (updated.city !== current.city || updated.status !== current.status) {
    const manifest = await getPrivate(env, privateKeys.listingManifest(listingId));
    await putPrivate(env, privateKeys.listingManifest(listingId), {
      ...manifest,
      city: updated.city,
      status: updated.status,
    });
  }

  return updated;
}

/** Looks up a listing draft by id. Returns `null` if it doesn't exist. */
export async function getListingById(env, listingId) {
  if (!isNonEmptyString(listingId)) return null;
  return getPrivate(env, privateKeys.listingDraft(listingId));
}

/**
 * Lists every listing draft owned by `brokerId`, via the listings-by-broker
 * index (§26) — no bucket scan. `brokerId` is the only parameter that
 * determines scope, so this can't accidentally read another tenant's data.
 */
export async function listListingsByBroker(env, brokerId) {
  if (!isNonEmptyString(brokerId)) return [];
  const listingIds = await getBrokerListingIds(env, brokerId);
  const listings = await Promise.all(listingIds.map((listingId) => getListingById(env, listingId)));
  return listings.filter(Boolean);
}
