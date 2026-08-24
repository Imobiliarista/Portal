// modules/pwa/manifest.js
//
// Módulo pwa (§48) — gera o Web App Manifest do portal a partir de
// configuração estática do projeto. Não lê nada de corretor/imóvel (nem
// de business/, core/ ou storage/) — só descreve o app shell público
// (frontend/portal/). §39 permitiria este módulo depender de
// business/core/storage, mas não há necessidade: o manifest é dado 100%
// estático, versionado no Git.
//
// scripts/generate-pwa-assets.js consome `buildManifestObject` para
// escrever frontend/manifest.json (Static Asset real — §94, §48).

export const PWA_MANIFEST_CONFIG = Object.freeze({
  name: "imobiliarista.net",
  short_name: "Imobiliarista",
  description: "Portal imobiliário — cidades, imóveis e corretores.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#0f172a",
  lang: "pt-BR",
  icons: Object.freeze([
    Object.freeze({ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }),
  ]),
});

/**
 * Retorna um objeto plano (deep clone) pronto para `JSON.stringify` —
 * o próprio manifest.json do PWA. Pura: mesma config estática sempre
 * produz o mesmo objeto, nenhum dado de corretor/imóvel entra aqui.
 */
export function buildManifestObject(config = PWA_MANIFEST_CONFIG) {
  return {
    name: config.name,
    short_name: config.short_name,
    description: config.description,
    start_url: config.start_url,
    scope: config.scope,
    display: config.display,
    background_color: config.background_color,
    theme_color: config.theme_color,
    lang: config.lang,
    icons: config.icons.map((icon) => ({ ...icon })),
  };
}
