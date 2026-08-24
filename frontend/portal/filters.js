// frontend/portal/filters.js
//
// Pure, client-side filtering/sorting/pagination-planning over cards
// (city-shard.schema.json) and index entries (city-index.schema.json),
// §20–§22. No network calls here — this module only decides *what* to
// show and, for large cities, *which shards* need fetching.

function normalize(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

/**
 * Applies a filter set to a list of cards or index entries — both share
 * enough fields (purpose, type, district, price, bedrooms, area) that one
 * predicate works for either.
 *
 * `filters` fields (all optional): purpose, type, district, priceMin,
 * priceMax, bedroomsMin, bathroomsMin, parkingSpacesMin, areaMin, areaMax.
 */
export function filterCards(items, filters = {}) {
  return items.filter((item) => {
    if (filters.purpose && normalize(item.purpose) !== normalize(filters.purpose)) return false;
    if (filters.type && normalize(item.type) !== normalize(filters.type)) return false;
    if (filters.district && normalize(item.district) !== normalize(filters.district)) return false;
    if (filters.priceMin != null && item.price < filters.priceMin) return false;
    if (filters.priceMax != null && item.price > filters.priceMax) return false;
    if (filters.bedroomsMin != null && (item.bedrooms ?? 0) < filters.bedroomsMin) return false;
    if (filters.bathroomsMin != null && (item.bathrooms ?? 0) < filters.bathroomsMin) return false;
    if (filters.parkingSpacesMin != null && (item.parkingSpaces ?? 0) < filters.parkingSpacesMin) return false;
    if (filters.areaMin != null && (item.area ?? 0) < filters.areaMin) return false;
    if (filters.areaMax != null && (item.area ?? 0) > filters.areaMax) return false;
    return true;
  });
}

const SORTERS = {
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
  "area-asc": (a, b) => (a.area ?? 0) - (b.area ?? 0),
  "area-desc": (a, b) => (b.area ?? 0) - (a.area ?? 0),
  relevance: (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || Number(b.featured) - Number(a.featured),
};

export const SORT_OPTIONS = Object.freeze(Object.keys(SORTERS));

export function sortCards(items, sortBy = "relevance") {
  const sorter = SORTERS[sortBy] ?? SORTERS.relevance;
  return [...items].sort(sorter);
}

/**
 * Given a city's compact index (§21) and a filter set, returns the sorted
 * list of shard numbers that could contain a match — so the caller fetches
 * only those shards instead of the whole city (§22: "não baixar imóveis
 * completos para pesquisar").
 */
export function shardsNeededForFilters(indexEntries, filters = {}) {
  const matched = filterCards(indexEntries, filters);
  return [...new Set(matched.map((entry) => entry.shard))].sort((a, b) => a - b);
}
