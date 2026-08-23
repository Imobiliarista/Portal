// storage/keys.js
//
// Deterministic R2 key builders (§23–§25). Nothing in this file touches a
// binding — it only knows how to turn ids/slugs into object keys, which is
// what makes lookups in `storage/private.js` and friends O(1) instead of a
// bucket scan (§26 "não varrer objetos").
//
// Every segment goes through `assertSafeSegment` so a malformed slug/id can
// never be used to escape its intended prefix (path traversal via "..", or
// smuggling an extra "/" into a key).

export const MAX_CARDS_PER_SHARD = 300; // §9
export const TARGET_COMPRESSED_SHARD_BYTES = 1_000_000; // §9 — ~1 MB comprimido
export const REBUILD_BATCH_SIZE = 100; // §34 — 100 shards por lote

function assertSafeSegment(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`storage/keys: "${label}" deve ser uma string não vazia.`);
  }
  if (value.includes("/") || value.includes("..") || value.includes("\\")) {
    throw new Error(`storage/keys: "${label}" contém caracteres não permitidos.`);
  }
  return value;
}

/** "001.json", "002.json", ... — always 3-digit, per the §11/§12 examples. */
export function shardFileName(shardNumber) {
  if (!Number.isInteger(shardNumber) || shardNumber < 1) {
    throw new Error("storage/keys: shardNumber deve ser um inteiro >= 1.");
  }
  return `${String(shardNumber).padStart(3, "0")}.json`;
}

// ---------------------------------------------------------------------------
// R2 PRIVATE (§23)
// ---------------------------------------------------------------------------
export const privateKeys = {
  brokerManifest(brokerId) {
    return `brokers/${assertSafeSegment(brokerId, "brokerId")}/manifest.json`;
  },
  brokerProfileDraft(brokerId) {
    return `brokers/${assertSafeSegment(brokerId, "brokerId")}/profile-draft.json`;
  },
  brokerSettings(brokerId) {
    return `brokers/${assertSafeSegment(brokerId, "brokerId")}/settings.json`;
  },
  listingManifest(listingId) {
    return `listings/${assertSafeSegment(listingId, "listingId")}/manifest.json`;
  },
  listingDraft(listingId) {
    return `listings/${assertSafeSegment(listingId, "listingId")}/draft.json`;
  },
  authUser(userId) {
    return `auth/${assertSafeSegment(userId, "userId")}.json`;
  },
  /** Resolves any public-facing slug (broker or listing) to { type, id }. */
  slugIndex(slug) {
    return `indexes/slugs/${assertSafeSegment(slug, "slug")}.json`;
  },
  /** Resolves a hashed login identifier to a userId — never store raw email as a key. */
  loginIndex(loginHash) {
    return `indexes/logins/${assertSafeSegment(loginHash, "loginHash")}.json`;
  },
  /** List of listingIds owned by a broker, for "meus imóveis" without a scan. */
  brokerListingsIndex(brokerId) {
    return `indexes/listings/${assertSafeSegment(brokerId, "brokerId")}.json`;
  },
  job(kind, id) {
    assertSafeSegment(kind, "kind");
    return `jobs/${kind}/${assertSafeSegment(id, "id")}.json`;
  },
  audit(id) {
    return `audit/${assertSafeSegment(id, "id")}.json`;
  },
};

// ---------------------------------------------------------------------------
// R2 DATA (§24) — public projections
// ---------------------------------------------------------------------------
export const dataKeys = {
  portalCities() {
    return "portal/cities.json";
  },
  portalTaxonomy() {
    return "portal/taxonomy.json";
  },
  portalModules() {
    return "portal/modules.json";
  },
  cityManifest(citySlug) {
    return `cities/${assertSafeSegment(citySlug, "citySlug")}/manifest.json`;
  },
  cityIndex(citySlug) {
    return `cities/${assertSafeSegment(citySlug, "citySlug")}/index.json`;
  },
  citySearch(citySlug) {
    return `cities/${assertSafeSegment(citySlug, "citySlug")}/search.json`;
  },
  cityShard(citySlug, shardNumber) {
    assertSafeSegment(citySlug, "citySlug");
    return `cities/${citySlug}/${shardFileName(shardNumber)}`;
  },
  listingPublic(listingSlug) {
    return `listings/${assertSafeSegment(listingSlug, "listingSlug")}.json`;
  },
  brokerProfilePublic(brokerSlug) {
    return `brokers/${assertSafeSegment(brokerSlug, "brokerSlug")}/profile.json`;
  },
  /** Small-broker case (§17): all listings in a single file. */
  brokerListingsFlat(brokerSlug) {
    return `brokers/${assertSafeSegment(brokerSlug, "brokerSlug")}/listings.json`;
  },
  /** Growing-broker case (§17): partitioned like a city. */
  brokerListingsManifest(brokerSlug) {
    return `brokers/${assertSafeSegment(brokerSlug, "brokerSlug")}/listings/manifest.json`;
  },
  brokerListingsShard(brokerSlug, shardNumber) {
    assertSafeSegment(brokerSlug, "brokerSlug");
    return `brokers/${brokerSlug}/listings/${shardFileName(shardNumber)}`;
  },
  exportBroker(brokerSlug) {
    return `exports/brokers/${assertSafeSegment(brokerSlug, "brokerSlug")}.json`;
  },
  exportListing(listingSlug) {
    return `exports/listings/${assertSafeSegment(listingSlug, "listingSlug")}.json`;
  },
  exportCity(citySlug) {
    return `exports/cities/${assertSafeSegment(citySlug, "citySlug")}.json`;
  },
};

// ---------------------------------------------------------------------------
// R2 MEDIA (§25)
// ---------------------------------------------------------------------------
export const mediaKeys = {
  listingCover(listingId, version, extension = "webp") {
    assertSafeSegment(listingId, "listingId");
    if (!Number.isInteger(version) || version < 1) {
      throw new Error("storage/keys: version deve ser um inteiro >= 1.");
    }
    return `listings/${listingId}/cover-v${version}.${extension}`;
  },
  listingGalleryItem(listingId, fileName) {
    assertSafeSegment(listingId, "listingId");
    return `listings/${listingId}/gallery/${assertSafeSegment(fileName, "fileName")}`;
  },
  listingVideoItem(listingId, fileName) {
    assertSafeSegment(listingId, "listingId");
    return `listings/${listingId}/videos/${assertSafeSegment(fileName, "fileName")}`;
  },
  brokerLogo(brokerId, extension = "webp") {
    return `brokers/${assertSafeSegment(brokerId, "brokerId")}/logo.${extension}`;
  },
  brokerCover(brokerId, extension = "webp") {
    return `brokers/${assertSafeSegment(brokerId, "brokerId")}/cover.${extension}`;
  },
};
