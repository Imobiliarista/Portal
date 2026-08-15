// Cache de borda (Cache API) para o tráfego público de portal/minisite —
// Documento Técnico Edge-First, Plano C, Parte 1. Prioridade 1 do fluxo de
// leitura: hit aqui responde sem rodar bot-detect pesado, sem
// env.ASSETS.fetch() e sem leitura de R2 (ver src/index.ts e wrangler.toml
// pras prioridades 2/3). Nunca usado em /api, /painel* ou qualquer rota
// autenticada/de escrita — essa triagem é feita pelo chamador (src/index.ts)
// antes de chamar estas funções.
//
// Invalidação: não há purge ativo hoje — o TTL curto abaixo já resolve a
// maior parte dos casos. Se no futuro for necessário invalidar cache
// manualmente após uma mudança crítica de status de um corretor (ex:
// suspensão imediata), usar a API de purge da Cloudflare por tag ou por URL
// (https://developers.cloudflare.com/api/operations/zone-purge).

// Parâmetros de tracking que não alteram o conteúdo da resposta — removidos
// da cache key pra não fragmentar o cache por clique de campanha/anúncio.
// Parâmetros de busca/filtro reais (ex: página de resultados do portal)
// permanecem na chave, pois afetam o conteúdo servido.
const PARAMS_TRACKING = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "gclsrc",
  "msclkid",
  "mc_cid",
  "mc_eid",
]);

// 10 min — ponto de partida pra anúncio/minisite; conteúdo muda pouco no
// curto prazo, mas não é estático permanente. Ajustável após observar
// comportamento real de tráfego.
const TTL_PADRAO_SEGUNDOS = 600;

export function montarChaveCacheEdge(url: URL, ehRobo: boolean): Request {
  const chave = new URL(url.toString());

  for (const nome of Array.from(chave.searchParams.keys())) {
    if (PARAMS_TRACKING.has(nome.toLowerCase())) {
      chave.searchParams.delete(nome);
    }
  }
  chave.searchParams.sort();

  // Marcador interno de variante — nunca visível ao cliente, só usado como
  // parte da cache key. Crítico: bot-detect (src/middleware/bot-detect.ts)
  // pode servir HTML pré-renderizado diferente do shell da SPA na mesma
  // URL pública — sem isso, humano poderia receber do cache uma resposta
  // gerada pra bot (ou vice-versa).
  chave.searchParams.set("__cache_variant", ehRobo ? "bot" : "human");

  // Cache API só aceita GET como método de chave.
  return new Request(chave.toString(), { method: "GET" });
}

export function gravarNoCacheDeBorda(
  chaveCache: Request,
  resposta: Response,
): Promise<void> | null {
  // Nunca cachear erro — cobre tanto 4xx/5xx genérico quanto o 503 que
  // routes/minisite.ts devolve pra corretor "não liberado", evitando manter
  // um status de liberação desatualizado em cache.
  if (resposta.status >= 400) {
    return null;
  }

  const cabecalhos = new Headers(resposta.headers);
  cabecalhos.set("Cache-Control", `public, max-age=${TTL_PADRAO_SEGUNDOS}`);

  const respostaParaCache = new Response(resposta.body, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers: cabecalhos,
  });

  return caches.default.put(chaveCache, respostaParaCache);
}
