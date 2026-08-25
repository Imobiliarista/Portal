// core/security.js
//
// Security headers (§81) and CORS policy (§80) shared by every response
// the Worker emits, plus small text sanitization helpers used by validation.
//
// IMPORTANT (Etapa 11 sub-lote 5, revisão headers/CORS/cache): this CSP is
// only ever attached to responses this Worker itself builds — /api/* JSON
// and modules/saved-search/index.js's 3 public HTML pages. It is NEVER
// attached to the actual portal/painel/admin/minisite HTML/JS pages
// (Workers Static Assets, wrangler.toml `run_worker_first = ["/api/*"]`,
// §73/§89 "static content never invokes the Worker") — the pages that
// load images/scripts/iframes and would benefit from CSP the most.
// Cloudflare Workers Static Assets supports a `_headers` file for that
// (https://developers.cloudflare.com/workers/static-assets/headers/), not
// added yet: `connect-src` below is too strict for
// modules/publications/index.js#resolveBloggerFeedUrl/parseAtomFeed,
// which `fetch()` an arbitrary broker-supplied Blogger domain from the
// browser (any `*.blogspot.com` or a custom domain) — wiring this CSP to
// those pages as-is would silently break that feature. Tracked as a
// pendência (docs/OPERATIONS.md) pending a product decision on how
// permissive `connect-src` should be for that module before it's safe to
// wire up. `frame-src` below WAS missing entirely (unnoticed exactly
// because this CSP reaches no page today) — added now so the definition
// itself is correct and ready once the wiring pendência is resolved.
export const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' https://media.imobiliarista.net data:; " +
    "connect-src 'self' https://dados.imobiliarista.net https://media.imobiliarista.net; " +
    "frame-src https://www.youtube-nocookie.com; " +
    "script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
});

/** Applies the standard security headers to a Response, returning a new one. */
export function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// §80 — R2 DATA/MEDIA only ever need to be read (GET/HEAD) by the browser.
// Writes always go through the Worker, never directly against R2.
//
// IMPORTANT (Etapa 11 sub-lote 5): `buildCorsHeaders` below has no call
// site anywhere in this codebase, by design, not by omission — R2
// DATA/MEDIA are served straight off their own Custom Domain
// (dados.imobiliarista.net/media.imobiliarista.net), never proxied
// through this Worker (same reasoning as the CSP note above), so no
// Worker response this function could attach to ever represents an R2
// read. This constant is the canonical, tested definition of the CORS
// policy Cloudflare's own R2 bucket CORS configuration (dashboard/API,
// same category as the Custom Domain + Cache Rule pendência in
// docs/OPERATIONS.md) should mirror — nothing here wires it there
// automatically. Tracked as a pendência in docs/OPERATIONS.md.
export const PUBLIC_READ_CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

export function buildCorsHeaders(origin, allowedOrigins) {
  const headers = new Headers(PUBLIC_READ_CORS_HEADERS);
  if (origin && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return headers;
}

// Matches ASCII control characters (C0 range + DEL) without embedding any
// literal control bytes in this source file.
const CONTROL_CHARS_PATTERN = new RegExp("[\\x00-\\x1F\\x7F]", "g");

/** Strips control characters and trims free-text input. */
export function sanitizeText(input) {
  if (typeof input !== "string") return "";
  return input.replace(CONTROL_CHARS_PATTERN, "").trim();
}

/** Constant-time string comparison, used for hash/signature checks. */
export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i += 1) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}
