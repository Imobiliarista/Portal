// business/cards.js
//
// Pure projection helpers: listing-public (§15) -> city-shard card (§13-14)
// -> city-index entry (§21). No R2 access here — business/publishing.js
// (Etapa 6, §31) owns reading/writing; these are just the two mappings,
// kept separate so they're trivially unit-testable.
//
// `id` on both the card and the index entry is the private `listingId`
// (§13's own example — "id": "listing_000123" — uses that exact format),
// not anything derived from listing-public.schema.json, which deliberately
// has no id field at all (only `slug`). Callers must pass it in.

/**
 * Builds a city-shard card (§13, `city-shard.schema.json`) from a normalized
 * listing-public object. `featured`/`priority` have no source anywhere in
 * the private draft yet (business/listings.js has no such fields) — this
 * lot defaults both, pending a future product/plans feature to set them
 * (see PR pendencies).
 *
 * The card's own `area` field keeps its name (§13/§21 contract, and
 * frontend/portal/filters.js's `areaMin`/`areaMax` filtering already reads
 * it) even though the source field was renamed to `features.livingArea` —
 * only the source changed, not the card's public shape.
 *
 * `suites`/`unitFloor` are included here (info that commonly shows up on a
 * real listing summary/thumbnail); `lotArea`/`livingRooms`/`kitchens` are
 * deliberately left out of the card — detail-page-only fields, per the PR.
 * Both are only added to the card object when present on the listing (never
 * `undefined`), consistent with how optional fields are handled elsewhere.
 */
export function buildListingCard(listingId, listingPublic) {
  return {
    id: listingId,
    slug: listingPublic.slug,
    title: listingPublic.title,
    purpose: listingPublic.purpose,
    type: listingPublic.type,
    price: listingPublic.price,
    district: listingPublic.location.district,
    bedrooms: listingPublic.features.bedrooms,
    bathrooms: listingPublic.features.bathrooms,
    parkingSpaces: listingPublic.features.parkingSpaces,
    area: listingPublic.features.livingArea,
    ...(listingPublic.features.suites !== undefined ? { suites: listingPublic.features.suites } : {}),
    ...(listingPublic.features.unitFloor !== undefined ? { unitFloor: listingPublic.features.unitFloor } : {}),
    cover: listingPublic.gallery[0] ?? null,
    brokerSlug: listingPublic.broker.slug,
    featured: false,
    priority: 0,
  };
}

/**
 * Builds a city-index entry (§21, `city-index.schema.json`) from a card
 * already built by `buildListingCard` — every field the index needs is a
 * subset of what the card already carries.
 */
export function buildIndexEntry(card, shardNumber) {
  return {
    id: card.id,
    slug: card.slug,
    shard: shardNumber,
    purpose: card.purpose,
    type: card.type,
    district: card.district,
    price: card.price,
    bedrooms: card.bedrooms,
    bathrooms: card.bathrooms,
    parkingSpaces: card.parkingSpaces,
    area: card.area,
  };
}
