// business/cities.js
//
// City catalog lookup (§7, §12, §66, Etapa 6 — §90). `city-manifest.schema.json`
// requires `city.name`/`city.uf` (pattern `^[A-Z]{2}$`), but the listing
// draft (business/listings.js, Lote 3) only stores `city` as a free-text
// slug — there is no name/UF anywhere in the private state. This module is
// the single source of truth for turning a city slug into a display
// name + UF: `business/data/cities-catalog.generated.js`, a static catalog
// generated once from the IBGE Localidades API by
// scripts/generate-cities-catalog.js (never fetched at runtime — §94, no
// new runtime dependency for something that can be checked into Git).
//
// A city slug outside the catalog is an explicit, loud error
// (`UnknownCityError`) — the publisher never fabricates a name/UF (§12).
// With national IBGE coverage this should practically never happen; see
// the catalog file's own header for its current (placeholder) status.

import { CITY_CATALOG } from "./data/cities-catalog.generated.js";

export class UnknownCityError extends Error {
  constructor(citySlug) {
    super(`Cidade "${citySlug}" não encontrada no catálogo de municípios (IBGE).`);
    this.name = "UnknownCityError";
    this.citySlug = citySlug;
  }
}

/** Returns `{ name, uf, ibgeCode }` for a city slug, or `null` if unknown. */
export function getCityBySlug(citySlug) {
  return CITY_CATALOG[citySlug] ?? null;
}

/** Same as `getCityBySlug`, but throws `UnknownCityError` instead of returning `null`. */
export function requireCityBySlug(citySlug) {
  const city = getCityBySlug(citySlug);
  if (!city) {
    throw new UnknownCityError(citySlug);
  }
  return city;
}
