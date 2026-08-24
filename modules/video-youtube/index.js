// modules/video-youtube/index.js
//
// Módulo video-youtube (§50) — ponto de entrada. O campo `video`
// ({provider: "youtube", id}) em si já é parte do schema do anúncio
// desde a Etapa 3 (business/listings.js#isValidVideo,
// business/publishing.js) — não é opcional/removível como pwa (§39
// nunca ficaria satisfeito tirando um campo do schema de anúncio), então
// não pertence a este módulo. O que este módulo isola é só o
// conhecimento específico do provider "youtube": extrair um id de uma
// URL colada no formulário do painel (`parseYoutubeId`) e montar a URL
// de embed usada pelo portal (`buildEmbedUrl`) — antes duplicado sem
// teste em frontend/painel/forms.js e frontend/portal/render.js.
//
// Como o browser só alcança `frontend/` (Static Assets —
// wrangler.toml `[assets] directory = "frontend"`; mesma restrição
// documentada em modules/pwa/README.md), este arquivo não é importado
// diretamente pelo frontend. `renderFrontendModuleSource` embute
// (`.toString()`, nunca redigitado) as duas funções — testadas aqui em
// Node — num ESM standalone que
// scripts/generate-video-youtube-assets.js grava em
// frontend/shared/video-youtube.generated.js (Static Asset real).

/**
 * Extrai o id de vídeo do YouTube de uma URL colada
 * (`youtube.com/watch?v=...`, `youtu.be/...`) ou aceita um id "nu"
 * (`[\w-]{6,}`). Retorna `null` para entrada vazia ou não reconhecida —
 * nunca lança.
 */
export function parseYoutubeId(input) {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1) || null;
    if (url.hostname.includes("youtube.com")) return url.searchParams.get("v");
    return null;
  } catch {
    return /^[\w-]{6,}$/.test(trimmed) ? trimmed : null;
  }
}

/**
 * Monta a URL de embed (`<iframe src="...">`) a partir de um id já
 * validado (`listing.video.id` — §50). `id` é URL-encoded por segurança
 * mesmo não sendo esperado conter caracteres especiais.
 */
export function buildEmbedUrl(id) {
  return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
}

/**
 * Gera o texto completo (standalone ESM, sem imports) de
 * frontend/shared/video-youtube.generated.js. Mesmo padrão de
 * modules/pwa/service-worker.js#renderServiceWorkerSource: o código
 * testado aqui em Node é literalmente o que roda no browser.
 */
export function renderFrontendModuleSource() {
  return `// frontend/shared/video-youtube.generated.js
//
// GERADO por scripts/generate-video-youtube-assets.js a partir de
// modules/video-youtube/index.js — não editar à mão (§50, módulo
// video-youtube). Regenerar com: npm run generate:video-youtube

export ${parseYoutubeId.toString()}

export ${buildEmbedUrl.toString()}
`;
}
