// Job: Gera /feeds/{portal-slug}/{slug-corretor}.{ext} para portais independentes
// Seção 4.11 e Lote 12.2 do project.md
// Diferente do Grupo OLX: cada portal tem toggle, cota e arquivo próprios

import { Env } from "../../index";
import { buscarCorrelorPorSlug } from "../../db/queries-corretores";
import { listarAnunciosDoCorretor } from "../../db/queries-anuncios";
import {
  buscarCotaPortal,
} from "../../db/queries-cotas-portal";
import { estaModuloAtivo } from "../../db/queries-modulos";
import { escreverJSON } from "../../lib/r2";
import {
  mapearTipoNegocioParaVRSync,
  mapearCategoriaParaVRSync,
  mapearTipoImovelParaVRSync,
  validarCamposObrigatorios,
} from "../../lib/vrsync-mapper";
import { sanitizarParaXML } from "../../lib/sanitize";

interface MensagemGerarFeedPortal {
  tipo: "gerar-feed-portal-independente";
  corretor_slug: string;
  portal_slug: string; // 'imovelweb', 'chaves-na-mao', etc.
}

interface AnuncioExportacao {
  id: number;
  titulo: string;
  descricao?: string;
  preco?: number;
  tipo_negocio_slug: string;
  categoria_slug: string;
  tipo_imovel_slug: string;
  cidade_nome?: string;
  bairro?: string;
  endereco_completo?: string;
  exibir_endereco_completo: boolean;
  area_total?: number;
  area_util?: number;
  quartos?: number;
  banheiros?: number;
  vagas_garagem?: number;
  fotos?: string[];
  criado_em: string;
  priorizado?: boolean;
}

// Prepara anúncio para exportação (genérico, independente de formato)
async function prepararAnuncioExportacao(
  db: D1Database,
  anuncio: any
): Promise<AnuncioExportacao | null> {
  const tipoNegocio = await buscarTipoNegocioPorId(db, anuncio.tipo_negocio_id);
  const categoria = await buscarCategoriaPorId(db, anuncio.categoria_imovel_id);
  const tipoImovel = await buscarTipoImovelPorId(db, anuncio.tipo_imovel_id);
  const cidade = await buscarCidadePorId(db, anuncio.cidade_id);

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

  const fotos: string[] = anuncio.fotos_json
    ? JSON.parse(anuncio.fotos_json)
    : [];
  const preco = anuncio.preco_venda || anuncio.preco_aluguel;

  return {
    id: anuncio.id,
    titulo: sanitizarParaXML(anuncio.titulo),
    descricao: anuncio.descricao
      ? sanitizarParaXML(anuncio.descricao)
      : undefined,
    preco,
    tipo_negocio_slug: tipoNegocio.slug,
    categoria_slug: categoria.slug,
    tipo_imovel_slug: tipoImovel.slug,
    cidade_nome: cidade.nome,
    bairro: anuncio.bairro
      ? sanitizarParaXML(anuncio.bairro)
      : undefined,
    endereco_completo: anuncio.endereco_completo
      ? sanitizarParaXML(anuncio.endereco_completo)
      : undefined,
    exibir_endereco_completo: anuncio.exibir_endereco_completo,
    area_total: anuncio.area_total,
    area_util: anuncio.area_util,
    quartos: anuncio.quartos,
    banheiros: anuncio.banheiros,
    vagas_garagem: anuncio.vagas_garagem,
    fotos: fotos.length > 0 ? fotos : undefined,
    criado_em: anuncio.criado_em,
  };
}

// Aplica cota contratada: prioriza anúncios marcados, depois mais recentes
function aplicarCota(
  anuncios: AnuncioExportacao[],
  cotaQuantidade?: number | null
): AnuncioExportacao[] {
  if (!cotaQuantidade || cotaQuantidade <= 0) {
    return anuncios;
  }

  const priorizados = anuncios.filter((a) => a.priorizado);
  const normais = anuncios
    .filter((a) => !a.priorizado)
    .sort((a, b) => {
      return (
        new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
      );
    });

  const resultado: AnuncioExportacao[] = [];
  let usado = 0;

  for (const a of priorizados) {
    if (usado >= cotaQuantidade) break;
    resultado.push(a);
    usado++;
  }

  for (const a of normais) {
    if (usado >= cotaQuantidade) break;
    resultado.push(a);
    usado++;
  }

  return resultado;
}

// Escapa caracteres especiais para XML
function escaparXML(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Gera XML VRSync (formato padrão para a maioria dos portais)
function gerarXMLVRSync(
  corretor_nome: string,
  anuncios: AnuncioExportacao[]
): string {
  const cabecalho = `<?xml version="1.0" encoding="UTF-8"?>\n<PropertyList>\n`;
  const rodape = `</PropertyList>`;

  const propriedades = anuncios
    .map((a) => {
      const tipoNegocio = mapearTipoNegocioParaVRSync(a.tipo_negocio_slug);
      const categoria = mapearCategoriaParaVRSync(a.categoria_slug);
      const tipo = mapearTipoImovelParaVRSync(a.tipo_imovel_slug);

      let xml = `  <Property>\n`;
      xml += `    <ID>${a.id}</ID>\n`;
      xml += `    <Title>${escaparXML(a.titulo)}</Title>\n`;

      if (a.descricao) {
        xml += `    <Description>${escaparXML(a.descricao)}</Description>\n`;
      }

      xml += `    <TransactionType>${tipoNegocio}</TransactionType>\n`;
      xml += `    <PropertyType>${categoria}</PropertyType>\n`;
      xml += `    <UnitType>${tipo}</UnitType>\n`;

      if (a.preco) {
        xml += `    <Price>${a.preco}</Price>\n`;
      }

      if (a.exibir_endereco_completo && a.endereco_completo) {
        xml += `    <Address>${escaparXML(a.endereco_completo)}</Address>\n`;
      } else if (a.bairro) {
        xml += `    <Neighborhood>${escaparXML(a.bairro)}</Neighborhood>\n`;
      }

      if (a.cidade_nome) {
        xml += `    <City>${escaparXML(a.cidade_nome)}</City>\n`;
      }

      if (a.area_total) {
        xml += `    <TotalArea>${a.area_total}</TotalArea>\n`;
      }

      if (a.area_util) {
        xml += `    <BuiltArea>${a.area_util}</BuiltArea>\n`;
      }

      if (a.quartos !== undefined) {
        xml += `    <Bedrooms>${a.quartos}</Bedrooms>\n`;
      }

      if (a.banheiros !== undefined) {
        xml += `    <Bathrooms>${a.banheiros}</Bathrooms>\n`;
      }

      if (a.vagas_garagem !== undefined) {
        xml += `    <Parking>${a.vagas_garagem}</Parking>\n`;
      }

      if (a.fotos && a.fotos.length > 0) {
        xml += `    <Images>\n`;
        for (const foto of a.fotos) {
          xml += `      <Image>${escaparXML(foto)}</Image>\n`;
        }
        xml += `    </Images>\n`;
      }

      xml += `  </Property>\n`;
      return xml;
    })
    .join("");

  return cabecalho + propriedades + rodape;
}

// Helpers para buscar dados relacionados
async function buscarTipoNegocioPorId(
  db: D1Database,
  id: number
): Promise<{ id: number; slug: string } | null> {
  try {
    const resultado = await db
      .prepare("SELECT id, slug FROM tipos_negocio WHERE id = ? LIMIT 1")
      .bind(id)
      .first() as any;
    return resultado || null;
  } catch (erro) {
    console.error("Erro ao buscar tipo de negócio:", erro);
    return null;
  }
}

async function buscarCategoriaPorId(
  db: D1Database,
  id: number
): Promise<{ id: number; slug: string } | null> {
  try {
    const resultado = await db
      .prepare("SELECT id, slug FROM categorias_imovel WHERE id = ? LIMIT 1")
      .bind(id)
      .first() as any;
    return resultado || null;
  } catch (erro) {
    console.error("Erro ao buscar categoria:", erro);
    return null;
  }
}

async function buscarTipoImovelPorId(
  db: D1Database,
  id: number
): Promise<{ id: number; slug: string } | null> {
  try {
    const resultado = await db
      .prepare("SELECT id, slug FROM tipos_imovel WHERE id = ? LIMIT 1")
      .bind(id)
      .first() as any;
    return resultado || null;
  } catch (erro) {
    console.error("Erro ao buscar tipo de imóvel:", erro);
    return null;
  }
}

async function buscarCidadePorId(
  db: D1Database,
  id: number
): Promise<{ id: number; nome: string } | null> {
  try {
    const resultado = await db
      .prepare("SELECT id, nome FROM cidades WHERE id = ? LIMIT 1")
      .bind(id)
      .first() as any;
    return resultado || null;
  } catch (erro) {
    console.error("Erro ao buscar cidade:", erro);
    return null;
  }
}

async function buscarPortalIndependente(
  db: D1Database,
  portal_slug: string
): Promise<{ id: number; slug: string; formato: string } | null> {
  try {
    const resultado = await db
      .prepare(
        "SELECT id, slug, formato FROM portais_independentes WHERE slug = ? LIMIT 1"
      )
      .bind(portal_slug)
      .first() as any;
    return resultado || null;
  } catch (erro) {
    console.error("Erro ao buscar portal independente:", erro);
    return null;
  }
}

// Processador principal
export async function processarGerarFeedPortalIndependente(
  mensagem: MensagemGerarFeedPortal,
  env: Env
): Promise<void> {
  const { corretor_slug, portal_slug } = mensagem;

  try {
    // Verifica se o módulo está ativo
    const moduloAtivo = await estaModuloAtivo(
      env.DB,
      "feed-portais-independentes"
    );
    if (!moduloAtivo) {
      console.log(
        `Módulo feed-portais-independentes está inativo. Pulando feed para "${corretor_slug}" / "${portal_slug}"`
      );
      return;
    }

    // Busca portal
    const portal = await buscarPortalIndependente(env.DB, portal_slug);
    if (!portal || !portal.formato) {
      console.error(
        `Portal "${portal_slug}" não encontrado ou sem formato definido`
      );
      return;
    }

    // Busca corretor
    const resultado = await buscarCorrelorPorSlug(env.DB, corretor_slug);
    if (!resultado) {
      console.error(`Corretor com slug "${corretor_slug}" não encontrado`);
      return;
    }

    const corretor = resultado.corretor;

    // Busca cota contratada pro portal
    const cota = await buscarCotaPortal(env.DB, corretor.id, portal_slug);
    if (!cota || !cota.ativo) {
      console.log(
        `Cota do portal "${portal_slug}" não ativa para corretor "${corretor_slug}". Pulando geração.`
      );
      return;
    }

    // Busca anúncios
    const { anuncios } = await listarAnunciosDoCorretor(env.DB, corretor.id, 1, 999);

    // Filtra apenas elegíveis
    const anunciosElegiveis = anuncios.filter(
      (a) => a.postar_na_rede && !a.vendido_removido
    );

    // Prepara anúncios
    const anunciosExportacao: AnuncioExportacao[] = [];
    for (const a of anunciosElegiveis) {
      const preparado = await prepararAnuncioExportacao(env.DB, a);
      if (preparado) {
        anunciosExportacao.push(preparado);
      }
    }

    console.log(
      `Anúncios preparados para ${portal_slug}: ${anunciosExportacao.length} de ${anunciosElegiveis.length} elegíveis`
    );

    // Aplica cota
    const anunciosFiltrados = aplicarCota(
      anunciosExportacao,
      cota.quantidade_contratada
    );

    // Gera arquivo conforme formato
    let conteudo: string;
    let contentType: string;
    let extensao: string;

    if (portal.formato === "vrsync-xml") {
      conteudo = gerarXMLVRSync(corretor.nome_completo, anunciosFiltrados);
      contentType = "application/xml; charset=utf-8";
      extensao = "xml";
    } else {
      console.warn(`Formato "${portal.formato}" não suportado para ${portal_slug}`);
      return;
    }

    // Salva no R2
    const caminho = `feeds/${portal_slug}/${corretor_slug}.${extensao}`;
    await env.JSON_CACHE.put(caminho, conteudo, {
      httpMetadata: {
        contentType,
      },
    });

    console.log(
      `✓ Feed ${portal_slug} gerado para "${corretor_slug}" com ${anunciosFiltrados.length} anúncios (cota: ${cota.quantidade_contratada || "ilimitada"})`
    );
  } catch (erro) {
    console.error(
      `Erro ao gerar feed ${portal_slug} para "${corretor_slug}":`,
      erro
    );
    throw erro;
  }
}

export type { MensagemGerarFeedPortal };
