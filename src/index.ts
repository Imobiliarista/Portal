import { redirecionarSemWww } from "./middleware/www-redirect";
import { ehBot, renderizarParaBot } from "./middleware/bot-detect";
import { rotasAuth } from "./routes/api-auth";
import { rotasPainelCorretor } from "./routes/painel-corretor";
import { rotasPainelSuperadmin } from "./routes/painel-superadmin";
import { rotasPortal } from "./routes/portal";
import { rotasMinиsite } from "./routes/minisite";
import { rotasSitemap } from "./routes/sitemap";
import { rotaFeedGrupoOLX } from "./modulos/feed-grupo-olx/rota";
import { processarFilaAlteracoes } from "./queue";

export interface Env {
  DB: D1Database;
  JSON_CACHE: R2Bucket;
  FILA_ALTERACOES: Queue;
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

    // Rota de feeds externos — Grupo OLX (Lote 12.1)
    if (url.pathname.match(/^\/feeds\/grupo-olx\/[a-z0-9-]+\.xml$/i)) {
      return rotaFeedGrupoOLX(request, url, env);
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
      return rotasMinиsite(request, env);
    }

    // Domínio raiz ou outro: portal
    return rotasPortal(request, env);
  },

  // Handler da Queue (Lote 6, seção 4.4)
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    return processarFilaAlteracoes(batch, env);
  },
};
