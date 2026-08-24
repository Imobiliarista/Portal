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

export async function fetchJson(url) {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Falha ao buscar ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

function shardFileName(shardNumber) {
  return `${String(shardNumber).padStart(3, "0")}.json`;
}

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
