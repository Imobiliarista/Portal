// modules/tour-360/index.js
//
// Módulo tour-360 (§49) — ponto de entrada. O campo `tour360` ({url})
// em si já é parte do schema do anúncio desde a Etapa 3
// (business/listings.js#isValidTour360, business/publishing.js) — não
// é opcional/removível como pwa (§39 nunca ficaria satisfeito tirando
// um campo do schema de anúncio), então não pertence a este módulo.
// Diferente do vídeo (§50 — "provider": "youtube" + um id que precisa
// virar URL de embed), o tour 360 já chega pronto como uma URL externa
// completa: não há id pra extrair nem embed pra montar, então não há
// um `parseXId`/`buildEmbedUrl` equivalente aqui. O que este módulo
// isola é só o "componente condicional" do §49 em si ("se inexistente,
// componente não renderiza"): a decisão de quando o link deve
// aparecer e com que props — antes inline em frontend/portal/render.js.
//
// Como o browser só alcança `frontend/` (Static Assets — wrangler.toml
// `[assets] directory = "frontend"`; mesma restrição documentada em
// modules/pwa/README.md e modules/video-youtube/README.md), este
// arquivo não é importado diretamente pelo frontend.
// `renderFrontendModuleSource` embute (`.toString()`, nunca
// redigitado) a função abaixo — testada aqui em Node — num ESM
// standalone que scripts/generate-tour-360-assets.js grava em
// frontend/shared/tour-360.generated.js (Static Asset real).

/**
 * Decide se o componente de tour 360 deve renderizar (§49: "se
 * inexistente, componente não renderiza") e, quando sim, as props pra
 * montar o link — nunca o nó DOM em si, que continua sendo
 * responsabilidade de frontend/portal/render.js (`el("a", ...)`).
 * `target`/`rel` ficam aqui porque são parte da mesma decisão de
 * "como linkar pra um provider externo" (mesmo espírito do
 * youtube-nocookie.com do módulo video-youtube). Retorna `null` para
 * `tour360` ausente/inválido — nunca lança.
 */
export function buildTour360LinkProps(tour360) {
  if (!tour360 || typeof tour360.url !== "string" || !tour360.url) return null;
  return {
    href: tour360.url,
    text: "Ver tour 360°",
    target: "_blank",
    rel: "noreferrer",
  };
}

/**
 * Gera o texto completo (standalone ESM, sem imports) de
 * frontend/shared/tour-360.generated.js. Mesmo padrão de
 * modules/video-youtube/index.js#renderFrontendModuleSource: o código
 * testado aqui em Node é literalmente o que roda no browser.
 */
export function renderFrontendModuleSource() {
  return `// frontend/shared/tour-360.generated.js
//
// GERADO por scripts/generate-tour-360-assets.js a partir de
// modules/tour-360/index.js — não editar à mão (§49, módulo tour-360).
// Regenerar com: npm run generate:tour-360

export ${buildTour360LinkProps.toString()}
`;
}
