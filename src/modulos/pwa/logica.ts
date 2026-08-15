// Elegibilidade do módulo PWA (controle duplo, seção 4.18 do project.md)
// e sincronização dos artefatos (manifest.json/service-worker.js/
// elegibilidade.json) na geração em lote do minisite e na alternância do
// módulo pelo Superadmin. Módulo isolado — não depende de rotas do
// núcleo (routes/minisite.ts, routes/portal.ts), duplica localmente a
// extração de hostname/slug, seguindo o mesmo padrão já usado em
// routes/sitemap.ts.
//
// D1 aparece só neste arquivo (job assíncrono via
// jobs/gerar-json-corretor.ts, ou ação administrativa síncrona via
// routes/painel-superadmin.ts) — nunca em modulos/pwa/rota.ts, que lê
// exclusivamente os artefatos de elegibilidade materializados abaixo em
// R2. Mesma folga de consistência já aceita em tenants/{slug}/status.json:
// a elegibilidade só reflete na próxima regeneração do minisite (job) ou
// na próxima alternância do módulo (Superadmin), nunca "ao vivo" por
// requisição pública.

import { Env } from "../../index";
import { estaModuloAtivo } from "../../db/queries-modulos";
import { buscarPlano } from "../../db/queries-planos";
import { deletarArquivo, escreverJSON } from "../../lib/r2";
import { gerarManifestCorretor } from "./gerador-manifest";
import { gerarServiceWorkerAtivo, gerarServiceWorkerSuicida } from "./gerador-service-worker";

export const DOMINIO_RAIZ = "imobiliarista.net";

export function ehDominioRaiz(hostname: string): boolean {
  return hostname === DOMINIO_RAIZ;
}

export function ehSubdominioMinisite(hostname: string): boolean {
  return hostname.endsWith(`.${DOMINIO_RAIZ}`) && !ehDominioRaiz(hostname);
}

export function extrairSlugMinisite(hostname: string): string | null {
  if (!ehSubdominioMinisite(hostname)) return null;
  const slug = hostname.split(".")[0];
  return slug || null;
}

export interface ElegibilidadePwa {
  elegivel: boolean;
  ehPortal: boolean;
  encontrado: boolean;
  nomeExibicao: string;
  slug?: string;
}

// Formato materializado em R2 (pwa/{slug}/elegibilidade.json e
// pwa/portal/elegibilidade.json) — lido por modulos/pwa/rota.ts no
// caminho público, nunca D1.
export interface ElegibilidadePwaArtefato {
  elegivel: boolean;
  nomeExibicao: string;
}

// Portal Principal: só depende da flag de rede (4.18, "não depende de
// Plano nenhum"). Minisite: flag de rede E `permite_pwa` do plano do
// corretor — as duas precisam ser verdadeiras. Consulta D1 diretamente —
// só é chamada em contexto de job (sincronizarArtefatosPwaDoCorretor
// abaixo), nunca a partir de rota.ts.
export async function verificarElegibilidadePwa(
  db: D1Database,
  hostname: string,
): Promise<ElegibilidadePwa> {
  const moduloAtivoNaRede = await estaModuloAtivo(db, "pwa");

  if (ehDominioRaiz(hostname)) {
    return {
      elegivel: moduloAtivoNaRede,
      ehPortal: true,
      encontrado: true,
      nomeExibicao: "Portal Imobiliário",
    };
  }

  const slug = extrairSlugMinisite(hostname);
  if (!slug) {
    return { elegivel: false, ehPortal: false, encontrado: false, nomeExibicao: "" };
  }

  if (!moduloAtivoNaRede) {
    return { elegivel: false, ehPortal: false, encontrado: true, nomeExibicao: slug, slug };
  }

  const resultado = (await db
    .prepare(
      `SELECT c.nome_completo, c.plano_id
       FROM corretores c
       JOIN minisites m ON m.corretor_id = c.id
       WHERE m.slug = ? LIMIT 1`,
    )
    .bind(slug)
    .first()) as { nome_completo: string; plano_id: number | null } | null;

  if (!resultado) {
    return { elegivel: false, ehPortal: false, encontrado: false, nomeExibicao: slug, slug };
  }

  const plano = resultado.plano_id ? await buscarPlano(db, resultado.plano_id) : null;

  return {
    elegivel: !!plano?.permite_pwa,
    ehPortal: false,
    encontrado: true,
    nomeExibicao: resultado.nome_completo,
    slug,
  };
}

// Chamada pela geração em lote (jobs/gerar-json-corretor.ts) toda vez que
// o minisite de um corretor é regenerado. Reconcilia os artefatos de PWA
// no R2 com a elegibilidade atual (rede + plano):
// - Elegível: grava manifest.json + service-worker.js normal.
// - Não elegível, mas já teve artefato antes: sobrescreve com o Service
//   Worker "suicida" (limpa cache/desregistra no dispositivo instalado).
// - Nunca teve artefato: não grava nada — evita registrar Service Worker
//   à toa em corretores que nunca tiveram o módulo disponível.
export async function sincronizarArtefatosPwaDoCorretor(
  env: Env,
  corretorSlug: string,
): Promise<void> {
  const elegibilidade = await verificarElegibilidadePwa(
    env.DB,
    `${corretorSlug}.${DOMINIO_RAIZ}`,
  );

  if (!elegibilidade.encontrado) return;

  const caminhoManifest = `pwa/${corretorSlug}/manifest.json`;
  const caminhoServiceWorker = `pwa/${corretorSlug}/service-worker.js`;
  const caminhoElegibilidade = `pwa/${corretorSlug}/elegibilidade.json`;

  // Grava sempre (elegível ou não) — modulos/pwa/rota.ts decide 404 vs.
  // servir os artefatos abaixo só com base neste arquivo, nunca D1.
  const artefatoElegibilidade: ElegibilidadePwaArtefato = {
    elegivel: elegibilidade.elegivel,
    nomeExibicao: elegibilidade.nomeExibicao,
  };
  await escreverJSON(env.DADOS_CACHE, caminhoElegibilidade, artefatoElegibilidade);

  if (elegibilidade.elegivel) {
    const manifest = gerarManifestCorretor(elegibilidade.nomeExibicao);
    await env.DADOS_CACHE.put(caminhoManifest, JSON.stringify(manifest), {
      httpMetadata: { contentType: "application/manifest+json; charset=utf-8" },
    });
    await env.DADOS_CACHE.put(
      caminhoServiceWorker,
      gerarServiceWorkerAtivo(new Date().toISOString()),
      { httpMetadata: { contentType: "application/javascript; charset=utf-8" } },
    );
    return;
  }

  await deletarArquivo(env.DADOS_CACHE, caminhoManifest);

  const jaTinhaArtefato = await env.DADOS_CACHE.head(caminhoServiceWorker);
  if (jaTinhaArtefato) {
    await env.DADOS_CACHE.put(caminhoServiceWorker, gerarServiceWorkerSuicida(), {
      httpMetadata: { contentType: "application/javascript; charset=utf-8" },
    });
  }
}

// Regrava pwa/portal/elegibilidade.json quando o Superadmin alterna o
// módulo "pwa" na rede (routes/painel-superadmin.ts). Portal Principal
// não depende de plano — só da flag de rede (4.18) — então não precisa
// do cálculo completo de verificarElegibilidadePwa; o booleano já
// resolvido pela própria rota administrativa é suficiente.
export async function sincronizarElegibilidadePortal(
  env: Env,
  ativo: boolean,
): Promise<void> {
  const artefato: ElegibilidadePwaArtefato = {
    elegivel: ativo,
    nomeExibicao: "Portal Imobiliário",
  };
  await escreverJSON(env.DADOS_CACHE, "pwa/portal/elegibilidade.json", artefato);
}
