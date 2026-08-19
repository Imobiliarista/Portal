import { redirecionarSemWww } from "./middleware/www-redirect";
import { ehBot } from "./middleware/bot-detect";
import { rotasAuth } from "./routes/api-auth";
import { rotasPainelCorretor } from "./routes/painel-corretor";
import { rotasPainelSuperadmin } from "./routes/painel-superadmin";
import { servirPainelRaiz } from "./routes/painel-gate";
import { rotasSitemap } from "./routes/sitemap";
import { rotaFeedPortalIndependente } from "./modulos/feed-portais-independentes/rota";
import { rotaBuscaIA } from "./modulos/busca-ia/rota";
import { rotaBuscaSalva } from "./modulos/busca-salva-email/rota";
import { rotaAgendamentoVisita } from "./modulos/agendamento-visita/rota";
import { rotaPwa } from "./modulos/pwa/rota";
import { rotasAnuncios } from "./routes/api-anuncios";
import { rotaWebhookAsaas } from "./routes/webhooks/asaas";
import { processarFilaAlteracoes, MensagemFila } from "./queue";
import { processarFilaMorta } from "./queue-dlq";
import { handleScheduled } from "./scheduled";
import type { StatusMinisiteJSON } from "./jobs/gerar-status-minisite";

export { StatusBackend } from "./status-backend";
export { SiteBackend } from "./site-backend";

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
  // Destinatário do alerta operacional de mensagens na dead letter queue
  // (Lote 23). Ver src/queue-dlq.ts.
  EMAIL_ALERTA_OPERACIONAL?: string;
  // Módulo Asaas (infraestrutura da Fase 3, isolada e desativada por
  // padrão — ver src/services/asaas.ts, src/routes/webhooks/asaas.ts e
  // project.md seção 2.3/3). ASAAS_ATIVO precisa ser exatamente "true"
  // pra qualquer chamada real sair; nunca ligado por padrão.
  ASAAS_ATIVO?: string;
  ASAAS_SANDBOX_API_KEY?: string;
  ASAAS_WEBHOOK_TOKEN?: string;
}

function ehDominioRaiz(hostname: string): boolean {
  // Domínio raiz é exatamente "imobiliarista.net" (sem subdomínio)
  return hostname === "imobiliarista.net";
}

function ehSubdominio(hostname: string): boolean {
  // Subdomínio tem formato "algo.imobiliarista.net"
  return hostname.endsWith(".imobiliarista.net") && !ehDominioRaiz(hostname);
}

// Migrado de routes/minisite.ts (v11.4, seção 40): a extração de slug é
// responsabilidade única do Gateway agora — é ele quem transforma
// hostname em ctx.props.tenant antes de repassar a chamada via
// ctx.exports. StatusBackend/SiteBackend nunca leem hostname pra decidir
// tenant (seção 38).
function extrairSlugDoSubdominio(hostname: string): string | null {
  // Formato esperado: {slug}.imobiliarista.net
  const partes = hostname.split(".");

  // Deve ter pelo menos 3 partes: slug.imobiliarista.net
  if (partes.length < 3) {
    return null;
  }

  // Pega a primeira parte (slug)
  const slug = partes[0];

  // Valida: slug não pode ser vazio, e o restante deve ser "imobiliarista.net"
  if (!slug || slug.length === 0) {
    return null;
  }

  return slug.toLowerCase();
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

    // Rota de feeds externos — Portais Independentes, Grupo OLX incluso
    // como mais uma linha de portais_independentes (Lote 12.1/12.2 +
    // reconstrução do feed, seção 4.11 — fusão de feed-grupo-olx aqui,
    // migration 0016). A regex genérica já casa /feeds/grupo-olx/{slug}.xml
    // como qualquer outro portal_slug, sem caso especial.
    if (url.pathname.match(/^\/feeds\/[a-z0-9-]+\/[a-z0-9-]+\.(xml|csv|json)$/i)) {
      return rotaFeedPortalIndependente(request, url, env);
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

    // Webhook do Asaas — infraestrutura isolada da Fase 3 (desativada
    // por padrão, ASAAS_ATIVO). Nunca toca no fluxo de troca de plano;
    // ver src/routes/webhooks/asaas.ts e src/services/asaas.ts.
    if (url.pathname === "/api/webhooks/asaas") {
      return rotaWebhookAsaas(request, env);
    }

    // Roteador do painel do corretor — independente do hostname
    // Ver project.md, Lote 8
    //
    // Prefixo de API separado do shell estático (/painel/*, servido por
    // env.ASSETS.fetch dentro de SiteBackend mais abaixo — mesmo padrão
    // de site-backend.ts, seção 4.6/4.9): antes o próprio
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
    // caminho de tenant/SiteBackend abaixo, que serviria o shell sem gate
    // nenhum pra qualquer visitante. Ver routes/painel-gate.ts.
    if (
      ehDominioRaiz(url.hostname) &&
      (url.pathname === "/painel" || url.pathname.startsWith("/painel/") ||
        url.pathname === "/painel-admin" || url.pathname.startsWith("/painel-admin/"))
    ) {
      return servirPainelRaiz(request, env, url);
    }

    // A partir daqui: caminho de portal/minisite, com cache multi-tenant
    // isolado via Workers Cache (v11.4 — ver PROJETO_EXECUTIVO_ARQUITETURA_
    // IMOBILIARISTA_v11_4, seções 39-49, e src/status-backend.ts /
    // src/site-backend.ts). Responsabilidade única do Gateway daqui em
    // diante: extrair o tenant do hostname e repassar via ctx.exports —
    // nunca consulta D1/R2, nunca renderiza (seções 40-41).
    const tenant = ehSubdominio(url.hostname)
      ? extrairSlugDoSubdominio(url.hostname)
      : "__portal__"; // Domínio raiz — tenant especial (seção 32)

    if (!tenant) {
      return new Response("Subdomínio inválido", {
        status: 400,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    // Gate de status — só existe pra minisite de corretor (mesma exceção
    // de sempre: o domínio raiz não tem corretor pra suspender, e nunca
    // teve tenants/__portal__/status.json). Sequencial, não paralelo com
    // SiteBackend (decisão fechada, seção 48): economizar a leitura do
    // site inteiro em corretor suspenso pesa mais que o ganho de
    // latência do paralelismo.
    //
    // cf.cacheKey explícito e tenant-aware nas duas chamadas abaixo — não
    // dá pra confiar só em ctx.props pra isolar a chave (seção 38):
    // validado em wrangler dev que, sem isso, a chave por padrão NÃO leva
    // o tenant em conta (seção 37) e uma requisição interna com a mesma
    // URL/path pra dois tenants diferentes colide na mesma entrada de
    // cache — exatamente o cenário que a seção 36 proíbe. Nunca reduzir
    // isto a só ctx.props sem o cacheKey explícito.
    if (tenant !== "__portal__") {
      const statusResp = await ctx.exports
        .StatusBackend({ props: { tenant } })
        .fetch(new Request(`http://internal/status/${tenant}`), {
          cf: { cacheKey: `status::${tenant}` },
        });
      const status = (await statusResp.json()) as StatusMinisiteJSON | null;
      const ativo = status !== null && status.existe && status.liberado;

      if (!ativo) {
        return new Response("Indisponível", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
    }

    // A mesma URL pode responder com HTML pré-renderizado pra bot ou com
    // o shell da SPA pra humano (dynamic rendering, seção 4.6/98-101) —
    // a variante precisa entrar na cache key aqui, ANTES do entrypoint
    // rodar: quem decide se serve do cache é a plataforma, antes mesmo de
    // chamar ctx.exports, então só o chamador (Gateway) pode influenciá-la.
    const variante = ehRobo ? "bot" : "human";

    return ctx.exports.SiteBackend({ props: { tenant } }).fetch(request, {
      cf: { cacheKey: `site::${tenant}::${url.pathname}${url.search}::${variante}` },
    });
  },

  // Handler da Queue (Lote 6, seção 4.4). Um único export `queue()` por
  // Worker (limitação da plataforma) atende os dois consumers declarados
  // em wrangler.toml — `batch.queue` diz de qual fila veio o lote, e cada
  // uma roteia pro seu próprio handler (Lote 23: imob-queue-dlq é só
  // log + alerta, nunca processa a mensagem original de novo).
  async queue(batch: MessageBatch<MensagemFila>, env: Env): Promise<void> {
    if (batch.queue === "imob-queue-dlq") {
      return processarFilaMorta(batch, env);
    }
    return processarFilaAlteracoes(batch, env);
  },

  // Handler do Cron Trigger — export mensal do D1 (Lote 13, seção 4.13)
  async scheduled(event: any, env: Env): Promise<void> {
    return handleScheduled(event, env);
  },
};
