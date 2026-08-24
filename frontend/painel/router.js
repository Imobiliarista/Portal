// frontend/painel/router.js
//
// Pure path parsing for the painel SPA (§54: perfil, imóveis). No DOM/
// history access here — frontend/painel/app.js owns wiring this to
// `window.location`/`history.pushState`, same convention as
// frontend/portal/router.js.
//
// Routes: "/" (dashboard/perfil), "/perfil", "/imoveis", "/imoveis/novo",
// "/imoveis/:id". Auth gating (login screen vs. these routes) is decided
// by frontend/painel/app.js from session state, not by this module — a
// route here doesn't imply the viewer is authenticated.

export function parseRoute(pathname) {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (segments.length === 0) {
    return { name: "dashboard" };
  }
  if (segments[0] === "perfil" && segments.length === 1) {
    return { name: "profile" };
  }
  if (segments[0] === "imoveis" && segments.length === 1) {
    return { name: "listings" };
  }
  if (segments[0] === "imoveis" && segments[1] === "novo" && segments.length === 2) {
    return { name: "listing-new" };
  }
  if (segments[0] === "imoveis" && segments.length === 2) {
    return { name: "listing-edit", id: segments[1] };
  }
  return { name: "not-found" };
}

export function buildListingEditUrl(id) {
  return `/imoveis/${id}`;
}
