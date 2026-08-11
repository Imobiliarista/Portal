import { redirecionarSemWww } from "./middleware/www-redirect";
import { ehBot, renderizarParaBot } from "./middleware/bot-detect";
import { rotasAuth } from "./routes/api-auth";
import { rotasPainelCorretor } from "./routes/painel-corretor";
import { rotasPainelSuperadmin } from "./routes/painel-superadmin";
import { rotasPortal } from "./routes/portal";
import { rotasMinisite } from "./routes/minisite";
import { rotasSitemap } from "./routes/sitemap";
import { rotaFeedGrupoOLX } from "./modulos/feed-grupo-olx/rota";
import { rotaFeedPortalIndependente } from "./modulos/feed-portais-independentes/rota";
import { rotaBuscaIA } from "./modulos/busca-ia/rota";
import { rotaBuscaSalva } from "./modulos/busca-salva-email/rota";
import { rotaAgendamentoVisita } from "./modulos/agendamento-visita/rota";
import { rotaPwa } from "./modulos/pwa/rota";
import { processarFilaAlteracoes } from "./queue";
import { handleScheduled } from "./scheduled";

export interface Env {
  DB: D1Database;
  DADOS_CACHE: R2Bucket;
  MIDIAS: R2Bucket;
  FILA_ALTERACOES: Queue;
  AI: any; // Cloudflare Workers AI binding
  TURNSTILE_SECRET_KEY?: string;
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
  async fetch(request: Request, env: Env): Promise<Response> {
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

    // Roteador do painel do corretor — domínio raiz apenas
    // Ver project.md, Lote 8
    if (ehDominioRaiz(url.hostname) && url.pathname.startsWith("/painel/")) {
      return rotasPainelCorretor(request, env);
    }

    // Roteador do painel do superadmin — domínio raiz apenas
    // Ver project.md, Lote 9
    if (ehDominioRaiz(url.hostname) && url.pathname.startsWith("/painel-admin/")) {
      return rotasPainelSuperadmin(request, env);
    }

    // Roteador principal: portal vs. minisite baseado no hostname
    // Ver project.md, seção 4.1 (roteamento por hostname)
    if (ehSubdominio(url.hostname)) {
      // Subdomínio: minisite do corretor
      return rotasMinisite(request, env);
    }

    // Domínio raiz ou outro: portal
    return rotasPortal(request, env);
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
