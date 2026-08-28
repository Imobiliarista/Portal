// frontend/dispatch.js
//
// Pure host/path → SPA module resolution for the single Static Assets
// deployment (§90, §74) that serves the whole zone (apex + wildcard).
// painel and admin are paths under the apex domain, not subdomains — the
// wildcard subdomain is reserved for corretor minisites and, in the
// future, onepages. dados.${apex}/media.${apex} are Custom Domains
// straight to R2 and never reach this module (they don't invoke Static
// Assets/index.html at all) — they stay in RESERVED_HOSTS only so a
// literal navigation to one of them can never be misread as a minisite
// slug.
//
// No DOM access here — frontend/index.html owns wiring this to
// `location`/`import()`, same convention as frontend/portal/router.js
// keeping route parsing separate from history/DOM wiring.

export function resolveModule({ hostname, pathname, search = "", apex = "imobiliarista.net" }) {
  const RESERVED_HOSTS = new Set([
    apex,
    `www.${apex}`,
    // painel.${apex}/admin.${apex} stay reserved even though they're no
    // longer dispatch targets (painel/admin are paths now) — kept out of
    // isMinisite below so a stale bookmark to the old subdomain falls
    // back to the portal shell instead of being looked up as a corretor
    // slug named "painel"/"admin".
    `painel.${apex}`,
    `admin.${apex}`,
    `dados.${apex}`,
    `media.${apex}`,
    "localhost",
    "127.0.0.1",
  ]);

  const isPainelPath = pathname === "/painel" || pathname.startsWith("/painel/");
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  // Local dev has no real imobiliarista.net to hit for path-based routing
  // to resolve against — `?app=painel`/`?app=admin` is the same kind of
  // escape hatch as frontend/portal/data.js's `window.__IMOB_DATA_BASE_URL__`
  // override.
  const devOverrideApp =
    hostname === "localhost" || hostname === "127.0.0.1" ? new URLSearchParams(search).get("app") : null;

  const isAdminHost = isAdminPath || devOverrideApp === "admin";
  const isPainelHost = !isAdminHost && (isPainelPath || devOverrideApp === "painel");
  const isMinisite = hostname.endsWith(`.${apex}`) && !RESERVED_HOSTS.has(hostname);
  const isPortalHost = !isAdminHost && !isPainelHost && !isMinisite;

  const modulePath = isAdminHost
    ? "/admin/app.js"
    : isPainelHost
      ? "/painel/app.js"
      : isMinisite
        ? "/minisite/app.js"
        : "/portal/app.js";

  return { modulePath, isAdminHost, isPainelHost, isMinisite, isPortalHost };
}
