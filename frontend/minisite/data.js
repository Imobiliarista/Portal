// frontend/minisite/data.js
//
// Same Browser → R2 DATA pattern as the portal (§2, §73), scoped to one
// broker. Slug comes from the hostname (§74), never from a path segment —
// a minisite only ever exists at {slug}.imobiliarista.net.
//
// Path builders below are intentionally NOT imported from storage/keys.js —
// see frontend/portal/data.js's header comment for why (Static Assets only
// serves frontend/, so a cross-boundary import 404s at runtime). These
// paths must stay in sync with storage/keys.js#dataKeys.
//
// `fetchJson` + the 4 typed error classes moved to
// ../shared/public-data-errors.js (Etapa 8) — shared with
// frontend/portal/data.js, same reasoning: both SPAs need the exact same
// distinction between "not found" (§75), an HTTP error, a network/CORS
// failure, and an invalid JSON body.

import {
  fetchJson,
  PublicDataNotFoundError,
  PublicDataHttpError,
  PublicDataNetworkError,
  PublicDataContractError,
} from "../shared/public-data-errors.js";

export { fetchJson, PublicDataNotFoundError, PublicDataHttpError, PublicDataNetworkError, PublicDataContractError };

const APEX = "imobiliarista.net";
const PRODUCTION_DATA_BASE_URL = `https://dados.${APEX}`;
const RESERVED_HOSTS = new Set([
  APEX,
  `www.${APEX}`,
  `painel.${APEX}`,
  `admin.${APEX}`,
  `dados.${APEX}`,
  `media.${APEX}`,
  "localhost",
  "127.0.0.1",
]);

/**
 * Resolves the broker slug from the current hostname (§74). Returns null
 * when the hostname isn't a minisite host (reserved subdomain, apex, or
 * local dev without an override) — callers should treat that as "site
 * inexistente" (§75).
 *
 * `window.__IMOB_MINISITE_SLUG__` is a dev/test escape hatch, since
 * "localhost" has no subdomain to sniff a slug from.
 */
export function resolveBrokerSlug() {
  if (typeof window !== "undefined" && window.__IMOB_MINISITE_SLUG__) {
    return window.__IMOB_MINISITE_SLUG__;
  }
  const hostname = typeof location !== "undefined" ? location.hostname : "";
  if (!hostname || RESERVED_HOSTS.has(hostname)) return null;
  const slug = hostname.split(".")[0];
  return slug || null;
}

export function getDataBaseUrl() {
  if (typeof window !== "undefined" && typeof window.__IMOB_DATA_BASE_URL__ === "string") {
    return window.__IMOB_DATA_BASE_URL__; // "" is a valid override (same-origin), not "unset"
  }
  const hostname = typeof location !== "undefined" ? location.hostname : "";
  if (hostname === "localhost" || hostname === "127.0.0.1") return "";
  return PRODUCTION_DATA_BASE_URL;
}

function shardFileName(shardNumber) {
  return `${String(shardNumber).padStart(3, "0")}.json`;
}

/**
 * Every method throws one of the 4 typed errors from
 * ../shared/public-data-errors.js instead of returning `null` on any
 * failure (Etapa 8) — frontend/minisite/app.js decides, per key, whether
 * `PublicDataNotFoundError` means "corretor não encontrado"/"imóvel não
 * encontrado" (§75, legitimate absence) or, for `profile`, needs to be
 * distinguished from a temporary outage (a broker that exists but whose
 * profile fetch failed for network/CORS/HTTP reasons is NOT the same as a
 * minisite that never existed — see app.js).
 */
export function createDataClient(baseUrl = getDataBaseUrl()) {
  const at = (key) => `${baseUrl}/${key}`;
  return {
    profile: (brokerSlug) => fetchJson(at(`brokers/${brokerSlug}/profile.json`)),
    listingsFlat: (brokerSlug) => fetchJson(at(`brokers/${brokerSlug}/listings.json`)),
    listingsManifest: (brokerSlug) => fetchJson(at(`brokers/${brokerSlug}/listings/manifest.json`)),
    listingsShard: (brokerSlug, shardNumber) => fetchJson(at(`brokers/${brokerSlug}/listings/${shardFileName(shardNumber)}`)),
    listing: (listingSlug) => fetchJson(at(`listings/${listingSlug}.json`)),
  };
}
