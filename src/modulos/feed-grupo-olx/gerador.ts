// Job: Gera /feeds/grupo-olx/{slug-corretor}.xml no formato VRSync
// Seção 4.11 do project.md

import { Env } from "../../index";
import { buscarCorrelorPorSlug } from "../../db/queries-corretores";
import { listarAnunciosDoCorretor } from "../../db/queries-anuncios";
import {
  buscarCotaPortal,
  contarAnunciosElegiveisParaPortal,
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

interface MensagemGerarXMLGrupoOLX {
  tipo: "gerar-xml-grupo-olx";
  corretor_slug: string;
}

interface AnuncioVRSync {
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

// Valida e prepara anúncio para XML (retorna null se inválido)
async function prepararAnuncioVRSync(
  db: D1Database,
  anuncio: any
): Promise<AnuncioVRSync | null> {
  // Busca taxonomia relacionada
  const tipoNegocio = await buscarTipoNegocioPorId(db, anuncio.tipo_negocio_id);
  const categoria = await buscarCategoriaPorId(db, anuncio.categoria_imovel_id);
  const tipoImovel = await buscarTipoImovelPorId(db, anuncio.tipo_imovel_id);
  const cidade = await buscarCidadePorId(db, anuncio.cidade_id);

  if (!tipoNegocio || !categoria || !tipoImovel || !cidade) {
    return null; // Dados incompletos
  }

  // Valida campos obrigatórios
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
  const preco = anuncio.preco_venda || anuncio.preco_aluguel;

  return {
    id: anuncio.id,
    titulo: sanitizarParaXML(anuncio.titulo),
    descricao: anuncio.descricao ? sanitizarParaXML(anuncio.descricao) : undefined,
    preco,
    tipo_negocio_slug: tipoNegocio.slug,
    categoria_slug: categoria.slug,
    tipo_imovel_slug: tipoImovel.slug,
    cidade_nome: cidade.nome,
    bairro: anuncio.bairro ? sanitizarParaXML(anuncio.bairro) : undefined,
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
  anuncios: AnuncioVRSync[],
  cotaQuantidade?: number | null
): AnuncioVRSync[] {
  if (!cotaQuantidade || cotaQuantidade <= 0) {
    // Sem cota ou ilimitado
    return anuncios;
  }

  // Separa priorizados dos normais
  const priorizados = anuncios.filter((a) => a.priorizado);
  const normais = anuncios.filter((a) => !a.priorizado).sort((a, b) => {
    // Ordena por mais recentes primeiro
    return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
  });

  // Combina: priorizados primeiro, depois normais até preencher cota
  const resultado: AnuncioVRSync[] = [];
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

// Gera XML VRSync a partir de anúncios preparados
function gerarXMLVRSync(
  corretor_nome: string,
  anuncios: AnuncioVRSync[]
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

      // Localização
      if (a.exibir_endereco_completo && a.endereco_completo) {
        xml += `    <Address>${escaparXML(a.endereco_completo)}</Address>\n`;
      } else if (a.bairro) {
        xml += `    <Neighborhood>${escaparXML(a.bairro)}</Neighborhood>\n`;
      }

      if (a.cidade_nome) {
        xml += `    <City>${escaparXML(a.cidade_nome)}</City>\n`;
      }

      // Especificações
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

      // Fotos
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

// Escapa caracteres especiais para XML
function escaparXML(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
      .first();
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
      .first();
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
      .first();
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
      .first();
    return resultado || null;
  } catch (erro) {
    console.error("Erro ao buscar cidade:", erro);
    return null;
  }
}

// Processador principal
export async function processarGerarXMLGrupoOLX(
  mensagem: MensagemGerarXMLGrupoOLX,
  env: Env
): Promise<void> {
  const { corretor_slug } = mensagem;

  try {
    // Verifica se o módulo está ativo
    const moduloAtivo = await estaModuloAtivo(env.DB, "feed-grupo-olx");
    if (!moduloAtivo) {
      console.log(`Módulo feed-grupo-olx está inativo. Pulando XML para "${corretor_slug}"`);
      return;
    }

    // Busca corretor
    const resultado = await buscarCorrelorPorSlug(env.DB, corretor_slug);
    if (!resultado) {
      console.error(`Corretor com slug "${corretor_slug}" não encontrado`);
      return;
    }

    const corretor = resultado.corretor;

    // Busca cota contratada pro Grupo OLX
    const cota = await buscarCotaPortal(env.DB, corretor.id, "grupo-olx");
    if (!cota || !cota.ativo) {
      console.log(
        `Cota do Grupo OLX não ativa para corretor "${corretor_slug}". Pulando geração.`
      );
      return;
    }

    // Busca anúncios do corretor (todos, depois filtra)
    const { anuncios } = await listarAnunciosDoCorretor(env.DB, corretor.id, 1, 999);

    // Filtra apenas elegíveis (postar_na_rede = true, vendido_removido = false)
    const anunciosElegiveis = anuncios.filter(
      (a) => a.postar_na_rede && !a.vendido_removido
    );

    // Prepara anúncios para VRSync (valida e mapeia campos)
    const anunciosVRSync: AnuncioVRSync[] = [];
    for (const a of anunciosElegiveis) {
      const preparado = await prepararAnuncioVRSync(env.DB, a);
      if (preparado) {
        anunciosVRSync.push(preparado);
      }
    }

    console.log(
      `Anúncios preparados para XML: ${anunciosVRSync.length} de ${anunciosElegiveis.length} elegíveis`
    );

    // Aplica cota contratada
    const anunciosFiltrados = aplicarCota(anunciosVRSync, cota.quantidade_contratada);

    // Gera XML
    const xml = gerarXMLVRSync(corretor.nome_completo, anunciosFiltrados);

    // Salva no R2
    const caminho = `feeds/grupo-olx/${corretor_slug}.xml`;
    await env.DADOS_CACHE.put(caminho, xml, {
      httpMetadata: {
        contentType: "application/xml; charset=utf-8",
      },
    });

    console.log(
      `✓ XML do Grupo OLX gerado para "${corretor_slug}" com ${anunciosFiltrados.length} anúncios (cota: ${cota.quantidade_contratada || "ilimitada"})`
    );
  } catch (erro) {
    console.error(`Erro ao gerar XML do Grupo OLX para "${corretor_slug}":`, erro);
    throw erro;
  }
}

export { MensagemGerarXMLGrupoOLX };
