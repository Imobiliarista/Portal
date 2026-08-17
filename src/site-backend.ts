// Entrypoint SiteBackend — v11.4, Arquitetura de Cache Multi-Tenant
// (PROJETO_EXECUTIVO_ARQUITETURA_IMOBILIARISTA_v11_4, seções 42-45).
//
// Migra pra dentro do fetch() a lógica que hoje vivia em routes/portal.ts
// (domínio raiz) e routes/minisite.ts (subdomínio de corretor). Exportado
// com [exports.SiteBackend.cache] enabled=true em wrangler.toml: em cache
// hit, este entrypoint não roda — só o Gateway (src/index.ts) executa.
//
// tenant vem exclusivamente de ctx.props.tenant, populado pelo Gateway —
// "__portal__" é o tenant especial do domínio raiz (seção 32: mesmo o
// portal tem conteúdo cacheável — home, listagens por cidade — que não
// pode colidir com nenhum minisite). Nunca lê hostname aqui dentro pra
// decidir tenant (mesma regra de status-backend.ts).
//
// Cache-Control "public, max-age=300" só é aplicado na resposta pública
// de fato (shell da SPA / dynamic rendering de bot pro portal, shell do
// minisite liberado) — nunca no gate de sessão do painel (redirects e
// HTML autenticado de /painel*), que precisa reavaliar o cookie de
// sessão em toda requisição e portanto nunca pode ser servido do cache
// compartilhado (ver comCacheHeader/semCache abaixo).

import { WorkerEntrypoint } from "cloudflare:workers";
import { Env } from "./index";
import { lerJSON } from "./lib/r2";
import type { StatusMinisiteJSON } from "./jobs/gerar-status-minisite";
import { ehBot, renderizarParaBot } from "./middleware/bot-detect";
import { ehRotaPublicacoes, rotaPublicacoes } from "./modulos/publicacoes/rota";
import { obterSessaoCompleta } from "./lib/sessao-destino";

interface SiteBackendProps {
  tenant: string;
}

const TTL_SITE_SEGUNDOS = 300;

// ============================================================
// Domínio raiz — migrado de routes/portal.ts
// ============================================================

interface ParamsMapeados {
  tipo: "home" | "cidade" | "negocio-categoria-tipo" | "anuncio";
  cidade?: string;
  tipoNegocio?: string;
  categoria?: string;
  tipoImovel?: string;
  slug?: string;
  id?: string;
}

function extrairParametrosURL(caminho: string): ParamsMapeados {
  const segmentos = caminho.split("/").filter((s) => s); // Remove strings vazias

  // Nenhum segmento = Home
  if (segmentos.length === 0) {
    return { tipo: "home" };
  }

  // 1 segmento: /{cidade}
  if (segmentos.length === 1) {
    return { tipo: "cidade", cidade: segmentos[0] };
  }

  // 2 segmentos: /{cidade}/{tipo-negocio}
  if (segmentos.length === 2) {
    return {
      tipo: "negocio-categoria-tipo",
      cidade: segmentos[0],
      tipoNegocio: segmentos[1],
    };
  }

  // 3 segmentos: /{cidade}/{tipo-negocio}/{categoria} ou {cidade}/{negocio}/{slug-id}
  if (segmentos.length === 3) {
    // Checar se o terceiro segmento parece um slug-id (contém hífen)
    const terceiro = segmentos[2];
    if (terceiro.includes("-")) {
      // Provável anúncio individual: /{cidade}/{tipo-negocio}/{slug-id}
      // Mas isto não está no padrão correto (falta tipo-imovel)
      // Por enquanto, tratar como "negocio-categoria-tipo" genérico
      return {
        tipo: "negocio-categoria-tipo",
        cidade: segmentos[0],
        tipoNegocio: segmentos[1],
        categoria: segmentos[2],
      };
    }
    return {
      tipo: "negocio-categoria-tipo",
      cidade: segmentos[0],
      tipoNegocio: segmentos[1],
      categoria: segmentos[2],
    };
  }

  // 4 segmentos: /{cidade}/{tipo-negocio}/{categoria}/{tipo-imovel}
  if (segmentos.length === 4) {
    const quarto = segmentos[3];
    if (quarto.includes("-")) {
      // Parece anúncio individual: /{cidade}/{tipo-negocio}/{categoria}/{slug-id}
      // Extrair id do fim após último hífen
      const ultimoHifen = quarto.lastIndexOf("-");
      const slug = quarto.substring(0, ultimoHifen);
      const id = quarto.substring(ultimoHifen + 1);
      return {
        tipo: "anuncio",
        cidade: segmentos[0],
        tipoNegocio: segmentos[1],
        categoria: segmentos[2],
        tipoImovel: "", // Inferir do slug/id se necessário
        slug,
        id,
      };
    }
    return {
      tipo: "negocio-categoria-tipo",
      cidade: segmentos[0],
      tipoNegocio: segmentos[1],
      categoria: segmentos[2],
      tipoImovel: segmentos[3],
    };
  }

  // 5 segmentos: /{cidade}/{tipo-negocio}/{tipo-imovel}/{slug-id}
  // Padrão: /{cidade}/{tipo-negocio}/{categoria}/{tipo-imovel}/{slug-id}
  if (segmentos.length === 5) {
    const quinto = segmentos[4];
    if (quinto.includes("-")) {
      const ultimoHifen = quinto.lastIndexOf("-");
      const slug = quinto.substring(0, ultimoHifen);
      const id = quinto.substring(ultimoHifen + 1);
      return {
        tipo: "anuncio",
        cidade: segmentos[0],
        tipoNegocio: segmentos[1],
        categoria: segmentos[2],
        tipoImovel: segmentos[3],
        slug,
        id,
      };
    }
  }

  // Padrão não reconhecido
  return { tipo: "home" };
}

// ============================================================
// Cabeçalhos de cache — só a resposta pública de fato leva
// "public, max-age=300"; erro e conteúdo de sessão nunca são cacheados.
// ============================================================

function comCacheHeader(resposta: Response): Response {
  const cabecalhos = new Headers(resposta.headers);
  // Nunca cachear erro (mesma proteção do antigo lib/edge-cache.ts) —
  // cobre, por exemplo, o 410 Gone de anúncio vendido/removido.
  if (resposta.status >= 400) {
    cabecalhos.set("Cache-Control", "no-store");
  } else {
    cabecalhos.set("Cache-Control", `public, max-age=${TTL_SITE_SEGUNDOS}`);
  }
  return new Response(resposta.body, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers: cabecalhos,
  });
}

function semCache(resposta: Response): Response {
  const cabecalhos = new Headers(resposta.headers);
  cabecalhos.set("Cache-Control", "private, no-store");
  return new Response(resposta.body, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers: cabecalhos,
  });
}

export class SiteBackend extends WorkerEntrypoint<Env, SiteBackendProps> {
  async fetch(request: Request): Promise<Response> {
    const { tenant } = this.ctx.props;
    const url = new URL(request.url);

    if (tenant === "__portal__") {
      return this.respostaPortal(request, url);
    }

    return this.respostaMinisite(request, url, tenant);
  }

  // Migrado de routes/portal.ts — dynamic rendering pra bot em anúncio
  // individual, shell real da SPA (env.ASSETS.fetch) pra todo o resto.
  private async respostaPortal(request: Request, url: URL): Promise<Response> {
    const parametros = extrairParametrosURL(url.pathname);

    if (ehBot(request) && parametros.tipo === "anuncio" && parametros.id) {
      const anuncioId = parseInt(parametros.id, 10);
      if (!isNaN(anuncioId)) {
        const respostaBotRendering = await renderizarParaBot(anuncioId, this.env);
        if (respostaBotRendering) {
          return comCacheHeader(respostaBotRendering);
        }
      }
    }

    return comCacheHeader(await this.env.ASSETS.fetch(request));
  }

  // Migrado de routes/minisite.ts — o Gateway (src/index.ts) já confirmou
  // via StatusBackend que o tenant está ativo/liberado antes de chamar
  // este entrypoint, então a existência/liberação não é checada de novo
  // aqui. A única exceção é o gate de sessão do painel, que precisa do
  // corretor_id do dono do minisite (status.json) pra checar posse — e
  // esse caminho nunca é cacheado.
  private async respostaMinisite(request: Request, url: URL, slug: string): Promise<Response> {
    // Painel do Superadmin não existe em subdomínio — redireciona pra
    // raiz, onde o gate de verdade roda (routes/painel-gate.ts). Nunca
    // cacheado: precisa preservar o path/query exatos em cada request.
    if (url.pathname === "/painel-admin" || url.pathname.startsWith("/painel-admin/")) {
      return semCache(
        new Response(null, {
          status: 302,
          headers: { location: `https://imobiliarista.net${url.pathname}${url.search}` },
        }),
      );
    }

    // Gate de sessão pro shell de /painel/* neste subdomínio — nunca
    // cacheado: precisa reavaliar o cookie de sessão em toda requisição.
    if (url.pathname === "/painel" || url.pathname.startsWith("/painel/")) {
      const status = await lerJSON<StatusMinisiteJSON>(
        this.env.DADOS_CACHE,
        `tenants/${slug}/status.json`,
      );
      const sessao = await obterSessaoCompleta(request, this.env);
      const autorizado =
        status !== null && sessao?.papel === "corretor" && sessao.corretor_id === status.corretor_id;

      if (!autorizado) {
        return semCache(new Response(null, { status: 302, headers: { location: "/login/" } }));
      }

      return semCache(await this.env.ASSETS.fetch(request));
    }

    // Módulo Publicações (path routing, /publicacoes e /publicacoes/{id})
    if (ehRotaPublicacoes(url.pathname)) {
      return comCacheHeader(await rotaPublicacoes(request, url, this.env));
    }

    // Minisite liberado: shell real da SPA via Static Assets. Dados do
    // corretor/anúncios são resolvidos no client-side, direto do JSON no
    // R2 — não aqui.
    return comCacheHeader(await this.env.ASSETS.fetch(request));
  }
}
