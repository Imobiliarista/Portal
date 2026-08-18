// Job: Gera /feeds/{portal-slug}/{slug-corretor}.{ext} — gerador único
// pra todos os portais externos, Grupo OLX incluso (seção 4.11 do
// project.md, Lote 12.2 + reconstrução do feed).
//
// Antes desta reconstrução, o Grupo OLX tinha um módulo próprio
// (feed-grupo-olx/) com ~370 linhas copiadas deste arquivo — a única
// diferença real era a flag de módulo-de-rede
// (`feed-grupo-olx` vs. `feed-portais-independentes`) e não ter linha
// em `portais_independentes`. A migration 0016 resolveu isso com um
// dado (`modulo_flag_slug` por linha) em vez de duplicar código.

import { Env } from "../../index";
import { buscarCorrelorPorSlug } from "../../db/queries-corretores";
import { listarAnunciosDoCorretor } from "../../db/queries-anuncios";
import { buscarCotaPortal } from "../../db/queries-cotas-portal";
import { estaModuloAtivo } from "../../db/queries-modulos";
import {
  prepararAnuncioParaExportacao,
  anuncioElegivelParaPortal,
  aplicarCota,
  AnuncioParaExportacao,
} from "../../lib/feeds/core";
import { formatadores } from "../../lib/feeds/registry";

interface MensagemGerarFeedPortal {
  tipo: "gerar-feed-portal-independente";
  corretor_slug: string;
  portal_slug: string; // 'grupo-olx', 'imovelweb', 'chaves-na-mao', etc.
}

interface PortalIndependente {
  id: number;
  slug: string;
  formato: string;
  modulo_flag_slug: string;
}

export async function buscarPortalIndependente(
  db: D1Database,
  portal_slug: string,
): Promise<PortalIndependente | null> {
  try {
    const resultado = await db
      .prepare(
        "SELECT id, slug, formato, modulo_flag_slug FROM portais_independentes WHERE slug = ? LIMIT 1",
      )
      .bind(portal_slug)
      .first();
    return (resultado as PortalIndependente | null) || null;
  } catch (erro) {
    console.error("Erro ao buscar portal independente:", erro);
    return null;
  }
}

// Processador principal — chamado pela Queue pra qualquer portal externo,
// Grupo OLX incluso.
export async function processarGerarFeedPortalIndependente(
  mensagem: MensagemGerarFeedPortal,
  env: Env,
): Promise<void> {
  const { corretor_slug, portal_slug } = mensagem;

  try {
    const portal = await buscarPortalIndependente(env.DB, portal_slug);
    if (!portal || !portal.formato) {
      console.error(`Portal "${portal_slug}" não encontrado ou sem formato definido`);
      return;
    }

    const moduloAtivo = await estaModuloAtivo(env.DB, portal.modulo_flag_slug);
    if (!moduloAtivo) {
      console.log(
        `Módulo "${portal.modulo_flag_slug}" está inativo. Pulando feed para "${corretor_slug}" / "${portal_slug}"`,
      );
      return;
    }

    const resultado = await buscarCorrelorPorSlug(env.DB, corretor_slug);
    if (!resultado) {
      console.error(`Corretor com slug "${corretor_slug}" não encontrado`);
      return;
    }
    const corretor = resultado.corretor;

    const cota = await buscarCotaPortal(env.DB, corretor.id, portal_slug);
    if (!cota || !cota.ativo) {
      console.log(
        `Cota do portal "${portal_slug}" não ativa para corretor "${corretor_slug}". Pulando geração.`,
      );
      return;
    }

    const { anuncios } = await listarAnunciosDoCorretor(env.DB, corretor.id, 1, 999);
    const anunciosElegiveis = anuncios.filter((a) => anuncioElegivelParaPortal(a, portal_slug));

    const anunciosExportacao: AnuncioParaExportacao[] = [];
    for (const a of anunciosElegiveis) {
      const preparado = await prepararAnuncioParaExportacao(env.DB, a);
      if (preparado) anunciosExportacao.push(preparado);
    }

    console.log(
      `Anúncios preparados para ${portal_slug}: ${anunciosExportacao.length} de ${anunciosElegiveis.length} elegíveis`,
    );

    const anunciosFiltrados = aplicarCota(anunciosExportacao, cota.quantidade_contratada);

    const formatador = formatadores[portal.formato];
    if (!formatador) {
      console.warn(`Formato "${portal.formato}" não tem formatador registrado para ${portal_slug}`);
      return;
    }

    const arquivo = formatador.gerar(corretor.nome_completo, anunciosFiltrados);

    const caminho = `feeds/${portal_slug}/${corretor_slug}.${arquivo.extensao}`;
    await env.DADOS_CACHE.put(caminho, arquivo.conteudo, {
      httpMetadata: { contentType: arquivo.contentType },
    });

    console.log(
      `✓ Feed ${portal_slug} gerado para "${corretor_slug}" com ${anunciosFiltrados.length} anúncios (cota: ${cota.quantidade_contratada || "ilimitada"})`,
    );
  } catch (erro) {
    console.error(`Erro ao gerar feed ${portal_slug} para "${corretor_slug}":`, erro);
    throw erro;
  }
}

export type { MensagemGerarFeedPortal };
