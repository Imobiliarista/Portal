import { redirecionarSemWww } from "./middleware/www-redirect";
import { ehBot, renderizarParaBot } from "./middleware/bot-detect";
import { rotasAuth } from "./routes/api-auth";
import { rotasPainelCorretor } from "./routes/painel-corretor";
import { rotasPainelSuperadmin } from "./routes/painel-superadmin";
import { servirPainelRaiz } from "./routes/painel-gate";
import { rotasPortal } from "./routes/portal";
import { rotasMinisite } from "./routes/minisite";
import { rotasSitemap } from "./routes/sitemap";
import { rotaFeedGrupoOLX } from "./modulos/feed-grupo-olx/rota";
import { rotaFeedPortalIndependente } from "./modulos/feed-portais-independentes/rota";
import { rotaBuscaIA } from "./modulos/busca-ia/rota";
import { rotaBuscaSalva } from "./modulos/busca-salva-email/rota";
import { rotaAgendamentoVisita } from "./modulos/agendamento-visita/rota";
import { rotaPwa } from "./modulos/pwa/rota";
import { rotasAnuncios } from "./routes/api-anuncios";
import { processarFilaAlteracoes } from "./queue";
import { handleScheduled } from "./scheduled";
import { montarChaveCacheEdge, gravarNoCacheDeBorda } from "./lib/edge-cache";

export interface Env {
  DB: D1Database;
  DADOS_CACHE: R2Bucket;
  MIDIAS: R2Bucket;
  FILA_ALTERACOES: Queue;
  AI: any; // Cloudflare Workers AI binding
  // Static Assets (shell da SPA, seção 4.6) — fallback pra visitante humano
  ASSETS: Fetcher;
  TURNSTILE_SECRET_KEY?: string;
  // URL do Feed Padrão da Rede (Blogspot institucional, módulo Publicações
  // — seção 4.19). Nunca hardcoded no código; ver src/modulos/publicacoes/logica.ts.
  FEED_PADRAO_REDE_URL?: string;
}

function ehDominioRaiz(hostname: string): boolean {
  // Domínio raiz é exatamente "imobiliarista.net" (sem subdomínio)
  return hostname === "imobiliarista.net";
}

function ehSubdominio(hostname: string): boolean {
  // Subdomínio tem formato "algo.imobiliarista.net"
  return hostname.endsWith(".imobiliarista.net") && !ehDominioRaiz(hostname);
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Middleware 1: Remoção de "www" — sempre primeira etapa
    // Ver project.md, seção 4.5.
    const redirecionamento = redirecionarSemWww(request);
    if (redirecionamento) {
      return redirecionamento;
    }

    // Middleware 2: Detecção de bots
    const ehRobo = ehBot(request);

    // Rota de sitemap.xml e robots.txt (Lote 11)
    if (
      url.pathname === "/robots.txt" ||
      url.pathname === "/sitemap.xml" ||
      url.pathname === "/sitemap-index.xml" ||
      url.pathname === "/sitemap-cidades.xml" ||
      url.pathname.match(/^\/sitemap-anuncios-\d+\.xml$/)
    ) {
      return rotasSitemap(request, env);
    }

    // Rota do módulo PWA — /apps/*, /manifest.json, /sw.js (Lote 15, seção 4.18)
    if (
      url.pathname === "/manifest.json" ||
      url.pathname === "/sw.js" ||
      url.pathname === "/apps" ||
      url.pathname === "/apps/android" ||
      url.pathname === "/apps/iphone"
    ) {
      return rotaPwa(request, url, env);
    }

    // Rota de feeds externos — Grupo OLX (Lote 12.1)
    if (url.pathname.match(/^\/feeds\/grupo-olx\/[a-z0-9-]+\.xml$/i)) {
      return rotaFeedGrupoOLX(request, url, env);
    }

    // Rota de feeds externos — Portais Independentes (Lote 12.2)
    if (url.pathname.match(/^\/feeds\/[a-z0-9-]+\/[a-z0-9-]+\.(xml|csv|json)$/i)) {
      // Evita conflito com grupo-olx verificando se não é grupo-olx
      if (!url.pathname.includes("grupo-olx")) {
        return rotaFeedPortalIndependente(request, url, env);
      }
    }

    // Rota de busca por IA — domínio raiz apenas (Lote 12.3)
    if (url.pathname === "/api/busca-ia") {
      return rotaBuscaIA(request, url, env);
    }

    // Rotas de busca salva — salvar e cancelar (Lote 12.6)
    if (
      url.pathname === "/api/busca-salva/salvar" ||
      url.pathname.match(/^\/api\/busca-salva\/cancelar\/[a-z0-9]{32}$/)
    ) {
      return rotaBuscaSalva(request, url, env);
    }

    // Rota pública de agendamento de visita — solicitar (Lote 12.7)
    if (url.pathname === "/api/agendamento/solicitar" && request.method === "POST") {
      return rotaAgendamentoVisita(request, url, env);
    }

    // Roteador de autenticação — independente do hostname
    if (url.pathname.startsWith("/api/auth/")) {
      return rotasAuth(request, env);
    }

    // Roteador de anúncios (CRUD, listagem, backup/restauração/exportação) —
    // independente do hostname, painel do corretor. Corrige lacuna
    // pré-existente: esta rota nunca havia sido montada aqui (Lote 5).
    if (url.pathname.startsWith("/api/anuncios")) {
      return rotasAnuncios(request, env);
    }

    // Roteador do painel do corretor — independente do hostname
    // Ver project.md, Lote 8
    //
    // Prefixo de API separado do shell estático (/painel/*, servido por
    // env.ASSETS.fetch via rotasPortal/rotasMinisite mais abaixo — mesmo
    // padrão de portal.ts/minisite.ts, seção 4.6/4.9): antes o próprio
    // /painel/* interceptava tudo, inclusive o HTML do shell
    // (public/painel/index.html), que nunca chegava a ser servido. Ver
    // auditoria de fluxo completo.
    //
    // Deliberadamente SEM ehDominioRaiz(): a rota nunca confia no hostname
    // pra identificar o corretor (sempre via cookie de sessão), e o corretor
    // aprovado passa a acessar o painel no próprio subdomínio
    // (nome.imobiliarista.net/painel/, "Login real + redirecionamento por
    // sessão") — essa API precisa responder lá também, não só na raiz.
    if (url.pathname.startsWith("/api/painel-corretor/")) {
      return rotasPainelCorretor(request, env);
    }

    // Roteador do painel do superadmin — domínio raiz apenas
    // Ver project.md, Lote 9
    //
    // Mesmo motivo acima: prefixo de API (/api/painel-admin/*) separado do
    // shell estático (/painel-admin/*, público/painel-admin/index.html).
    if (ehDominioRaiz(url.hostname) && url.pathname.startsWith("/api/painel-admin/")) {
      return rotasPainelSuperadmin(request, env);
    }

    // Gate de sessão pro shell de /painel*/painel-admin* na raiz — fecha a
    // exposição da auditoria de segurança (HTML do painel servido sem
    // checagem nenhuma via env.ASSETS.fetch). Precisa rodar ANTES do
    // despachar()/rotasPortal abaixo, que serviria o shell sem gate
    // nenhum pra qualquer visitante. Ver routes/painel-gate.ts.
    if (
      ehDominioRaiz(url.hostname) &&
      (url.pathname === "/painel" || url.pathname.startsWith("/painel/") ||
        url.pathname === "/painel-admin" || url.pathname.startsWith("/painel-admin/"))
    ) {
      return servirPainelRaiz(request, env, url);
    }

    // Roteador principal: portal vs. minisite baseado no hostname
    // Ver project.md, seção 4.1 (roteamento por hostname)
    const despachar = (): Promise<Response> =>
      ehSubdominio(url.hostname)
        ? rotasMinisite(request, env) // Subdomínio: minisite do corretor
        : rotasPortal(request, env); // Domínio raiz ou outro: portal

    // Cache de borda (Plano C, Parte 1) — primeira camada de resposta pro
    // maior volume de leitura pública do projeto (portal + até 10 mil
    // minisites). Só GET/HEAD, só portal/minisite público de fato — nunca
    // /painel*/painel-admin* (shell autenticado) nem qualquer rota acima
    // (API, sitemap, feeds, pwa, busca), que seguem o fluxo normal sem
    // passar por aqui. Ver src/lib/edge-cache.ts.
    const elegivelParaCacheDeBorda =
      (request.method === "GET" || request.method === "HEAD") &&
      !url.pathname.startsWith("/painel");

    if (!elegivelParaCacheDeBorda) {
      return despachar();
    }

    const chaveCache = montarChaveCacheEdge(url, ehRobo);
    const respostaCache = await caches.default.match(chaveCache);
    if (respostaCache) {
      // Hit: nada abaixo roda — sem bot-detect, sem env.ASSETS.fetch, sem R2.
      return respostaCache;
    }

    const resposta = await despachar();

    // GET apenas — HEAD não tem corpo, gravar a chave (normalizada pra GET
    // em montarChaveCacheEdge) com um corpo vazio poisoaria a próxima leitura.
    if (request.method === "GET") {
      const gravacao = gravarNoCacheDeBorda(chaveCache, resposta.clone());
      if (gravacao) {
        ctx.waitUntil(gravacao);
      }
    }

    return resposta;
  },

  // Handler da Queue (Lote 6, seção 4.4)
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    return processarFilaAlteracoes(batch, env);
  },

  // Handler do Cron Trigger — export mensal do D1 (Lote 13, seção 4.13)
  async scheduled(event: any, env: Env): Promise<void> {
    return handleScheduled(event, env);
  },
};
