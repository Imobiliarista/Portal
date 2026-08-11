// Elegibilidade do módulo PWA (controle duplo, seção 4.18 do project.md)
// e sincronização dos artefatos (manifest.json/service-worker.js) na
// geração em lote do minisite. Módulo isolado — não depende de rotas do
// núcleo (routes/minisite.ts, routes/portal.ts), duplica localmente a
// extração de hostname/slug, seguindo o mesmo padrão já usado em
// routes/sitemap.ts.

import { Env } from "../../index";
import { estaModuloAtivo } from "../../db/queries-modulos";
import { buscarPlano } from "../../db/queries-planos";
import { deletarArquivo } from "../../lib/r2";
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

// Portal Principal: só depende da flag de rede (4.18, "não depende de
// Plano nenhum"). Minisite: flag de rede E `permite_pwa` do plano do
// corretor — as duas precisam ser verdadeiras.
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
