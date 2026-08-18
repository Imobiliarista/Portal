// Núcleo compartilhado de exportação de anúncios pra feeds de portais
// externos (Grupo OLX + portais independentes) — seção 4.11 do project.md.
//
// Antes desta reconstrução, feed-grupo-olx/gerador.ts e
// feed-portais-independentes/gerador.ts tinham 8 funções idênticas
// coladas (as 4 buscas de taxonomia × 2 arquivos), mais aplicarCota,
// escaparXML e gerarXMLVRSync — código copiado, não compartilhado. Este
// arquivo é o ponto único de onde vem o anúncio já buscado, validado e
// sanitizado, independente de qual portal/formato vai consumir depois.

import { sanitizarParaExportacao } from "../sanitize";
import { validarCamposObrigatorios } from "../vrsync-mapper";

export const LIMITE_DESCRICAO = 6000;

export interface AnuncioParaExportacao {
  id: number;
  titulo: string;
  descricao?: string;
  precoVenda?: number;
  precoLocacao?: number;
  cep?: string;
  tipoNegocioSlug: string;
  categoriaSlug: string;
  tipoImovelSlug: string;
  cidadeNome?: string;
  bairro?: string;
  enderecoCompleto?: string;
  exibirEnderecoCompleto: boolean;
  areaTotal?: number;
  areaUtil?: number;
  quartos?: number;
  banheiros?: number;
  vagasGaragem?: number;
  fotos?: string[];
  videoUrl?: string;
  criadoEm: string;
}

// Decide qual(is) tag(s) de preço usar a partir da classificação real do
// anúncio (tipo_negocio_slug) — nunca de qual campo "por acaso" está
// preenchido. Corrige o bug de `preco_venda || preco_aluguel`, que
// ignorava a classificação e podia vazar um preço de venda residual num
// anúncio já reclassificado como locação (ou vice-versa).
export function resolverPrecos(
  tipoNegocioSlug: string,
  precoVenda?: number,
  precoAluguel?: number,
): { precoVenda?: number; precoLocacao?: number } {
  if (tipoNegocioSlug === "venda") {
    return { precoVenda: precoVenda ?? undefined };
  }
  if (tipoNegocioSlug === "locacao") {
    return { precoLocacao: precoAluguel ?? undefined };
  }
  return {};
}

async function buscarTipoNegocioPorId(
  db: D1Database,
  id: number,
): Promise<{ id: number; slug: string } | null> {
  try {
    const resultado = await db
      .prepare("SELECT id, slug FROM tipos_negocio WHERE id = ? LIMIT 1")
      .bind(id)
      .first();
    return (resultado as { id: number; slug: string } | null) || null;
  } catch (erro) {
    console.error("Erro ao buscar tipo de negócio:", erro);
    return null;
  }
}

async function buscarCategoriaPorId(
  db: D1Database,
  id: number,
): Promise<{ id: number; slug: string } | null> {
  try {
    const resultado = await db
      .prepare("SELECT id, slug FROM categorias_imovel WHERE id = ? LIMIT 1")
      .bind(id)
      .first();
    return (resultado as { id: number; slug: string } | null) || null;
  } catch (erro) {
    console.error("Erro ao buscar categoria:", erro);
    return null;
  }
}

async function buscarTipoImovelPorId(
  db: D1Database,
  id: number,
): Promise<{ id: number; slug: string } | null> {
  try {
    const resultado = await db
      .prepare("SELECT id, slug FROM tipos_imovel WHERE id = ? LIMIT 1")
      .bind(id)
      .first();
    return (resultado as { id: number; slug: string } | null) || null;
  } catch (erro) {
    console.error("Erro ao buscar tipo de imóvel:", erro);
    return null;
  }
}

async function buscarCidadePorId(
  db: D1Database,
  id: number,
): Promise<{ id: number; nome: string } | null> {
  try {
    const resultado = await db
      .prepare("SELECT id, nome FROM cidades WHERE id = ? LIMIT 1")
      .bind(id)
      .first();
    return (resultado as { id: number; nome: string } | null) || null;
  } catch (erro) {
    console.error("Erro ao buscar cidade:", erro);
    return null;
  }
}

// Busca taxonomia relacionada, valida campos obrigatórios e sanitiza —
// retorna null se o anúncio não estiver pronto pra exportação (mesmo
// padrão silencioso de sempre: falta de dado obrigatório tira o anúncio
// do feed, não quebra a geração inteira).
export async function prepararAnuncioParaExportacao(
  db: D1Database,
  anuncio: any,
): Promise<AnuncioParaExportacao | null> {
  const [tipoNegocio, categoria, tipoImovel, cidade] = await Promise.all([
    buscarTipoNegocioPorId(db, anuncio.tipo_negocio_id),
    buscarCategoriaPorId(db, anuncio.categoria_imovel_id),
    buscarTipoImovelPorId(db, anuncio.tipo_imovel_id),
    buscarCidadePorId(db, anuncio.cidade_id),
  ]);

  if (!tipoNegocio || !categoria || !tipoImovel || !cidade) {
    return null;
  }

  const validacao = validarCamposObrigatorios(tipoImovel.slug, {
    area_total: anuncio.area_total,
    area_util: anuncio.area_util,
    quartos: anuncio.quartos,
    banheiros: anuncio.banheiros,
  });

  if (!validacao.valido) {
    console.warn(`Anúncio ${anuncio.id} inválido: ${validacao.erro}`);
    return null;
  }

  const fotos: string[] = anuncio.fotos_json ? JSON.parse(anuncio.fotos_json) : [];
  const { precoVenda, precoLocacao } = resolverPrecos(
    tipoNegocio.slug,
    anuncio.preco_venda,
    anuncio.preco_aluguel,
  );

  return {
    id: anuncio.id,
    titulo: sanitizarParaExportacao(anuncio.titulo),
    descricao: anuncio.descricao
      ? sanitizarParaExportacao(anuncio.descricao, LIMITE_DESCRICAO)
      : undefined,
    precoVenda,
    precoLocacao,
    cep: anuncio.cep || undefined,
    tipoNegocioSlug: tipoNegocio.slug,
    categoriaSlug: categoria.slug,
    tipoImovelSlug: tipoImovel.slug,
    cidadeNome: cidade.nome,
    bairro: anuncio.bairro ? sanitizarParaExportacao(anuncio.bairro) : undefined,
    enderecoCompleto: anuncio.endereco_completo
      ? sanitizarParaExportacao(anuncio.endereco_completo)
      : undefined,
    exibirEnderecoCompleto: !!anuncio.exibir_endereco_completo,
    areaTotal: anuncio.area_total,
    areaUtil: anuncio.area_util,
    quartos: anuncio.quartos,
    banheiros: anuncio.banheiros,
    vagasGaragem: anuncio.vagas_garagem,
    fotos: fotos.length > 0 ? fotos : undefined,
    videoUrl: anuncio.video_youtube_id
      ? `https://www.youtube.com/watch?v=${anuncio.video_youtube_id}`
      : undefined,
    criadoEm: anuncio.criado_em,
  };
}

// Filtro de elegibilidade — igual pra qualquer portal (postar_na_rede +
// não vendido/removido), com uma exceção pontual pro Grupo OLX: também
// exige `publicar_grupo_olx = true`, o toggle real por anúncio que
// substitui o campo `priorizado` morto (ver migration 0015). Nenhum
// outro portal independente tem toggle próprio por anúncio ainda — fica
// como decisão separada, não incluída nesta reconstrução.
export function anuncioElegivelParaPortal(anuncio: any, portalSlug: string): boolean {
  if (!anuncio.postar_na_rede || anuncio.vendido_removido) return false;
  if (portalSlug === "grupo-olx") return !!anuncio.publicar_grupo_olx;
  return true;
}

// Aplica a cota contratada: corta pelo mais recente primeiro quando o
// conjunto elegível excede a quantidade contratada. Sem segunda camada
// de "prioridade manual" — o `priorizado` que existia antes nunca foi
// ligado a nada (sempre undefined em produção); pro Grupo OLX, marcar
// `publicar_grupo_olx` já é o próprio ato de priorizar.
export function aplicarCota(
  anuncios: AnuncioParaExportacao[],
  cotaQuantidade?: number | null,
): AnuncioParaExportacao[] {
  if (!cotaQuantidade || cotaQuantidade <= 0) {
    return anuncios;
  }

  return [...anuncios]
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
    .slice(0, cotaQuantidade);
}
