// storage/cache.js
//
// Cache-Control policy for public JSON (§59–§61). Actual edge caching for
// R2 DATA/MEDIA is configured via a Cache Rule on the custom domain (§59
// "Cache Rule explícita no Custom Domain de R2") — that is Cloudflare
// dashboard/Terraform configuration, not something this module can set by
// itself. What lives here are the TTL constants (single source of truth,
// per §9 "valores são configuração de produto, não hardcode espalhado")
// and a best-effort edge-cache purge helper for the Worker's own fetches.

export const CACHE_TTL_SECONDS = Object.freeze({
  cityManifest: 60, // §60 "TTL curto"
  cityShard: 300, // §60 "TTL curto/moderado"
  cityIndex: 300,
  listingPublic: 300, // §60 "TTL curto/moderado"
  brokerProfile: 300, // §60 "TTL curto/moderado"
  portalCatalog: 300, // portal/cities.json, portal/taxonomy.json
  media: 31_536_000, // versioned media objects — TTL longo (§59)
});

export function buildCacheControl(kind) {
  const ttl = CACHE_TTL_SECONDS[kind];
  if (ttl === undefined) {
    throw new Error(`storage/cache: TTL desconhecido para "${kind}".`);
  }
  if (kind === "media") {
    return `public, max-age=${ttl}, immutable`;
  }
  return `public, max-age=${ttl}, must-revalidate`;
}

/**
 * Best-effort purge of this Worker's own edge cache entry for a request
 * (Cache API `caches.default`). This does not purge R2's Custom Domain
 * cache tier — that purge path is the Cloudflare Cache Rule / API purge
 * referenced in §60 ("PUT → purge quando necessário") and is out of scope
 * for Etapa 1. Safe to call even where `caches` is unavailable (e.g. tests).
 */
export async function purgeEdgeCache(request) {
  if (typeof caches === "undefined" || !caches.default) return false;
  return caches.default.delete(request);
}
