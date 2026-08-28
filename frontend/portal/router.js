// frontend/portal/router.js
//
// Pure path/query parsing and URL building for the portal SPA (§18):
// home ("/"), cidade ("/{citySlug}", filtros via querystring — §18 shows
// "/londrina?venda&apartamento" as an illustrative example; this SPA uses
// an explicit key=value querystring instead, noted in the Lote 2 PR as a
// deliberate choice for reliable parsing), imóvel completo
// ("/imovel/{slug}", §15) and comparação ("/comparar", §45 — the selection
// itself lives in localStorage, not in the URL, so this route takes no
// params).
//
// No DOM/history access here — frontend/portal/app.js owns wiring this to
// `window.location`/`history.pushState` so this module stays testable in
// plain Node.

const NUMERIC_FILTER_KEYS = [
  "priceMin",
  "priceMax",
  "bedroomsMin",
  "bathroomsMin",
  "parkingSpacesMin",
  "areaMin",
  "areaMax",
];
const STRING_FILTER_KEYS = ["purpose", "type", "district"];

/** Parses a URLSearchParams-compatible querystring into a filters object + sortBy. */
export function parseCityQuery(search) {
  const params = new URLSearchParams(search);
  const filters = {};

  for (const key of STRING_FILTER_KEYS) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  for (const key of NUMERIC_FILTER_KEYS) {
    const raw = params.get(key);
    if (raw === null || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) filters[key] = value;
  }

  const sortBy = params.get("sort") || undefined;
  return { filters, sortBy };
}

/** Builds a "/{citySlug}?..." URL from a filters object + sortBy. */
export function buildCityUrl(citySlug, { filters = {}, sortBy } = {}) {
  const params = new URLSearchParams();
  for (const key of [...STRING_FILTER_KEYS, ...NUMERIC_FILTER_KEYS]) {
    if (filters[key] !== undefined && filters[key] !== null && filters[key] !== "") {
      params.set(key, String(filters[key]));
    }
  }
  if (sortBy) params.set("sort", sortBy);
  const query = params.toString();
  return `/${citySlug}${query ? `?${query}` : ""}`;
}

export function buildListingUrl(slug) {
  return `/imovel/${slug}`;
}

export function buildComparisonUrl() {
  return "/comparar";
}

/**
 * Parses `pathname` + `search` into a route descriptor:
 *   { name: "home" }
 *   { name: "listing", slug }
 *   { name: "comparison" }
 *   { name: "city", citySlug, filters, sortBy }
 *   { name: "not-found" }
 */
export function parseRoute(pathname, search = "") {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (segments.length === 0) {
    return { name: "home" };
  }

  if (segments[0] === "imovel" && segments.length === 2) {
    return { name: "listing", slug: segments[1] };
  }

  if (segments[0] === "comparar" && segments.length === 1) {
    return { name: "comparison" };
  }

  // painel/admin are reserved paths dispatched straight to their own SPA
  // modules by frontend/dispatch.js (they never reach this router in
  // normal operation) — reserved here too, defensively, so a future bug
  // in that dispatch can never fall through to this portal router
  // treating "painel"/"admin" as a city slug and 404ing a lookup for a
  // city that doesn't exist.
  if ((segments[0] === "painel" || segments[0] === "admin") && segments.length === 1) {
    return { name: "not-found" };
  }

  if (segments.length === 1) {
    const { filters, sortBy } = parseCityQuery(search);
    return { name: "city", citySlug: segments[0], filters, sortBy };
  }

  return { name: "not-found" };
}
