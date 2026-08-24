// frontend/portal/data.js
//
// Browser → R2 DATA, straight — no Worker involved (§2, §73).
//
// Path builders below are intentionally NOT imported from storage/keys.js:
// Workers Static Assets only serves files under wrangler.toml's [assets]
// directory ("frontend/"), so "../../storage/keys.js" doesn't exist at the
// deployed URL — it 404s and single-page-application fallback quietly
// serves index.html for it (breaking the whole module graph with a MIME
// error). These paths must stay in sync with storage/keys.js#dataKeys,
// which remains the authoritative definition on the write side.

const APEX = "imobiliarista.net";
const PRODUCTION_DATA_BASE_URL = `https://dados.${APEX}`;

/**
 * Resolves the base URL for R2 DATA reads. In local/dev (localhost,
 * 127.0.0.1) this returns "" so fetches resolve same-origin against the
 * Static Assets server, which is where dev fixtures live (see
 * docs/OPERATIONS.md) — no R2 binding or Custom Domain needed to develop
 * the SPA locally. `window.__IMOB_DATA_BASE_URL__` is an escape hatch for
 * tests/staging.
 */
export function getDataBaseUrl() {
  if (typeof window !== "undefined" && typeof window.__IMOB_DATA_BASE_URL__ === "string") {
    return window.__IMOB_DATA_BASE_URL__; // "" is a valid override (same-origin), not "unset"
  }
  const hostname = typeof location !== "undefined" ? location.hostname : "";
  if (hostname === "localhost" || hostname === "127.0.0.1") return "";
  return PRODUCTION_DATA_BASE_URL;
}

/** GETs and parses JSON; treats HTTP 404 as "doesn't exist" (§75, §77), not an error. */
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

/**
 * A small client over the public read paths the portal SPA needs.
 * `baseUrl` defaults to `getDataBaseUrl()` but can be overridden (tests,
 * or a future staging data domain).
 */
export function createDataClient(baseUrl = getDataBaseUrl()) {
  const at = (key) => `${baseUrl}/${key}`;
  return {
    portalCities: () => fetchJson(at("portal/cities.json")),
    taxonomy: () => fetchJson(at("portal/taxonomy.json")),
    cityManifest: (citySlug) => fetchJson(at(`cities/${citySlug}/manifest.json`)),
    cityIndex: (citySlug) => fetchJson(at(`cities/${citySlug}/index.json`)),
    cityShard: (citySlug, shardNumber) => fetchJson(at(`cities/${citySlug}/${shardFileName(shardNumber)}`)),
    listing: (slug) => fetchJson(at(`listings/${slug}.json`)),
  };
}
