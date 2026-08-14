// Backup interno, restauração e exportação em formato de mercado dos
// anúncios do corretor.
// GET /api/anuncios/backup · POST /api/anuncios/restaurar · GET /api/anuncios/exportar/:portal
// Conforme seção 4.20 do project.md — funcionalidade core de portabilidade
// de dados, disponível a todo corretor independente de Plano (não é módulo
// de src/modulos/). Extraído de api-anuncios-crud.ts (já no limite de
// linhas) para manter a convenção de ~500 linhas por arquivo (seção 7).

import { Env } from "../index";
import { Anuncio, Plano } from "../types/modelos";
import { obterCorretorAutenticado } from "../lib/sessao";
import {
  listarAnunciosDoCorretor,
  buscarAnuncioPorId,
  contarAnunciosAtivosDoCorretor,
  restaurarAnuncioComId,
} from "../db/queries-anuncios";
import { enfileirarRevalidacaoDoAnuncio } from "../jobs/revalidacao-cruzada";
import {
  mapearTipoNegocioParaVRSync,
  mapearCategoriaParaVRSync,
  mapearTipoImovelParaVRSync,
  validarCamposObrigatorios,
} from "../lib/vrsync-mapper";
import { sanitizarParaXML } from "../lib/sanitize";

const VERSAO_SCHEMA_BACKUP = "1.0.0";

// ========== Auxiliares ==========

function respostaErro(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ erro: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Busca plano contratado (catálogo) do corretor — mesmo padrão usado em api-anuncios-crud.ts
async function buscarPlanoDoCorretor(db: D1Database, corretorId: number): Promise<Plano | undefined> {
  const plano = await db
    .prepare(`SELECT p.* FROM planos p JOIN corretores c ON c.plano_id = p.id WHERE c.id = ?`)
    .bind(corretorId)
    .first();
  return (plano as Plano) || undefined;
}

// Valida os campos mínimos exigidos pelo schema da tabela `anuncios` (NOT NULL)
function anuncioValidoParaRestaurar(a: any): a is Anuncio {
  return !!(
    a &&
    typeof a.id === "number" &&
    typeof a.titulo === "string" && a.titulo.trim() &&
    typeof a.tipo_negocio_id === "number" &&
    typeof a.categoria_imovel_id === "number" &&
    typeof a.tipo_imovel_id === "number" &&
    typeof a.cidade_id === "number" &&
    typeof a.corretor_id === "number" &&
    typeof a.slug === "string" && a.slug.trim()
  );
}

// ========== (a) Backup interno — GET /api/anuncios/backup ==========

async function handleBackup(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return respostaErro("Método não permitido", 405);

  try {
    const corretorId = await obterCorretorAutenticado(request, env);
    if (!corretorId) return respostaErro("Não autenticado", 401);

    // Todos os anúncios do corretor (qualquer status) — schema interno completo;
    // fotos_json já contém apenas links pro R2, nunca o binário (seção 4.20a)
    const { anuncios } = await listarAnunciosDoCorretor(env.DB, corretorId, 1, 999999);

    const geradoEm = new Date().toISOString();
    const conteudo = {
      versao_schema: VERSAO_SCHEMA_BACKUP,
      gerado_em: geradoEm,
      corretor_id: corretorId,
      total_anuncios: anuncios.length,
      anuncios,
    };

    return new Response(JSON.stringify(conteudo), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="backup-anuncios-${corretorId}-${geradoEm.slice(0, 10)}.json"`,
      },
    });
  } catch (erro) {
    console.error("Erro ao gerar backup de anúncios:", erro);
    return respostaErro("Erro ao gerar backup", 500);
  }
}

// ========== (a) Restauração — POST /api/anuncios/restaurar ==========

interface PayloadBackup {
  versao_schema?: string;
  anuncios?: unknown[];
}

async function handleRestaurar(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return respostaErro("Método não permitido", 405);

  const corretorId = await obterCorretorAutenticado(request, env);
  if (!corretorId) return respostaErro("Não autenticado", 401);

  let payload: PayloadBackup;
  try {
    payload = await request.json();
  } catch {
    return respostaErro("JSON inválido");
  }

  if (!Array.isArray(payload?.anuncios)) {
    return respostaErro("Formato inválido: esperado { anuncios: [...] } no schema de backup (ver GET /api/anuncios/backup)");
  }

  try {
    // Modo seguro por padrão (seção 4.20a): nunca restaura anúncio de outro
    // corretor, nunca sobrescreve — só cria o que ainda não existe (checagem por ID)
    const invalidos: unknown[] = [];
    const deOutroCorretor: number[] = [];
    const candidatos: Anuncio[] = [];

    for (const item of payload.anuncios) {
      if (!anuncioValidoParaRestaurar(item)) {
        invalidos.push((item as any)?.id ?? null);
        continue;
      }
      if (item.corretor_id !== corretorId) {
        deOutroCorretor.push(item.id);
        continue;
      }
      candidatos.push(item);
    }

    const novos: Anuncio[] = [];
    const ignoradosExistentes: number[] = [];
    for (const a of candidatos) {
      const existente = await buscarAnuncioPorId(env.DB, a.id);
      if (existente) {
        ignoradosExistentes.push(a.id);
      } else {
        novos.push(a);
      }
    }

    if (novos.length === 0) {
      return new Response(JSON.stringify({
        sucesso: true,
        mensagem: "Nenhum anúncio novo para restaurar — todos já existem ou eram inválidos",
        criados: [],
        ignorados_existentes: ignoradosExistentes,
        ignorados_outro_corretor: deOutroCorretor,
        invalidos,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }

    // Validação contra os limites do Plano atual antes de gravar (seção 4.20a):
    // rejeita import inteiro que ultrapasse maxAnuncios/maxFotosPorAnuncio —
    // nada é gravado até a validação passar
    const plano = await buscarPlanoDoCorretor(env.DB, corretorId);
    if (!plano) return respostaErro("Plano do corretor não encontrado", 404);

    const ativosAtuais = await contarAnunciosAtivosDoCorretor(env.DB, corretorId);
    const novosAtivos = novos.filter((a) => !a.vendido_removido).length;
    if (ativosAtuais + novosAtivos > plano.max_anuncios) {
      return respostaErro(
        `Import rejeitado: ${ativosAtuais} anúncio(s) ativo(s) + ${novosAtivos} no arquivo ultrapassam o limite do plano (${plano.max_anuncios}). Reduza o arquivo ou faça upgrade de plano antes de restaurar.`,
        409
      );
    }

    for (const a of novos) {
      const fotos: string[] = a.fotos_json ? JSON.parse(a.fotos_json) : [];
      if (fotos.length > plano.max_fotos_por_anuncio) {
        return respostaErro(
          `Import rejeitado: anúncio "${a.titulo}" (ID ${a.id}) tem ${fotos.length} fotos; o plano permite até ${plano.max_fotos_por_anuncio} por anúncio. Reduza antes de restaurar.`,
          409
        );
      }
    }

    // Grava — cria só os novos, preservando o ID original do backup (seção 4.11: identificador imutável)
    const criados: number[] = [];
    for (const a of novos) {
      await restaurarAnuncioComId(env.DB, a);
      criados.push(a.id);
      await enfileirarRevalidacaoDoAnuncio(env, a.id, corretorId, a.cidade_id);
    }

    return new Response(JSON.stringify({
      sucesso: true,
      mensagem: `${criados.length} anúncio(s) restaurado(s); ${ignoradosExistentes.length} já existia(m) e foram ignorados`,
      criados,
      ignorados_existentes: ignoradosExistentes,
      ignorados_outro_corretor: deOutroCorretor,
      invalidos,
    }), { status: 201, headers: { "content-type": "application/json" } });
  } catch (erro) {
    console.error("Erro ao restaurar anúncios:", erro);
    return respostaErro("Erro ao processar restauração", 500);
  }
}

// ========== (b) Exportação em formato de mercado — GET /api/anuncios/exportar/:portal ==========
// Via de mão única (nunca entra pela rota /restaurar) — reaproveita os
// mapeadores de taxonomia de lib/vrsync-mapper.ts (Lote 12/seção 4.11).
// "grupo-olx" é sempre VRSync XML; portais independentes seguem o `formato`
// cadastrado em portais_independentes pelo Superadmin — hoje só "vrsync-xml"
// tem mapeador implementado (mesma limitação de modulos/feed-portais-independentes/gerador.ts).

interface LinhaExportacao {
  id: number;
  titulo: string;
  descricao?: string;
  preco_venda?: number;
  preco_aluguel?: number;
  tipo_negocio_slug: string;
  categoria_slug: string;
  tipo_imovel_slug: string;
  cidade_nome: string;
  bairro?: string;
  endereco_completo?: string;
  exibir_endereco_completo: number | boolean;
  area_total?: number;
  area_util?: number;
  quartos?: number;
  banheiros?: number;
  vagas_garagem?: number;
  fotos_json?: string;
}

function escaparXML(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Gera XML VRSync a partir das linhas já mapeadas — mesmo formato de tags
// usado no feed automático (feed-grupo-olx/gerador.ts), garantindo que a
// cópia exportada avulsa seja compatível com o que o portal já recebe
function construirXMLVRSync(linhas: LinhaExportacao[]): string {
  const cabecalho = `<?xml version="1.0" encoding="UTF-8"?>\n<PropertyList>\n`;
  const rodape = `</PropertyList>`;

  const propriedades = linhas
    .map((a) => {
      const tipoNegocio = mapearTipoNegocioParaVRSync(a.tipo_negocio_slug);
      const categoria = mapearCategoriaParaVRSync(a.categoria_slug);
      const tipo = mapearTipoImovelParaVRSync(a.tipo_imovel_slug);
      const preco = a.preco_venda || a.preco_aluguel;
      const fotos: string[] = a.fotos_json ? JSON.parse(a.fotos_json) : [];

      let xml = `  <Property>\n`;
      xml += `    <ID>${a.id}</ID>\n`;
      xml += `    <Title>${escaparXML(sanitizarParaXML(a.titulo))}</Title>\n`;

      if (a.descricao) {
        xml += `    <Description>${escaparXML(sanitizarParaXML(a.descricao))}</Description>\n`;
      }

      xml += `    <TransactionType>${tipoNegocio}</TransactionType>\n`;
      xml += `    <PropertyType>${categoria}</PropertyType>\n`;
      xml += `    <UnitType>${tipo}</UnitType>\n`;

      if (preco) {
        xml += `    <Price>${preco}</Price>\n`;
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

      if (a.quartos !== undefined && a.quartos !== null) {
        xml += `    <Bedrooms>${a.quartos}</Bedrooms>\n`;
      }

      if (a.banheiros !== undefined && a.banheiros !== null) {
        xml += `    <Bathrooms>${a.banheiros}</Bathrooms>\n`;
      }

      if (a.vagas_garagem !== undefined && a.vagas_garagem !== null) {
        xml += `    <Parking>${a.vagas_garagem}</Parking>\n`;
      }

      if (fotos.length > 0) {
        xml += `    <Images>\n`;
        for (const foto of fotos) {
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

async function handleExportar(request: Request, env: Env, portalSlug: string): Promise<Response> {
  if (request.method !== "GET") return respostaErro("Método não permitido", 405);

  try {
    const corretorId = await obterCorretorAutenticado(request, env);
    if (!corretorId) return respostaErro("Não autenticado", 401);

    // Resolve o formato do portal pedido
    let formato: string;
    if (portalSlug === "grupo-olx") {
      formato = "vrsync-xml";
    } else {
      const portal = await env.DB
        .prepare("SELECT formato FROM portais_independentes WHERE slug = ? LIMIT 1")
        .bind(portalSlug)
        .first() as { formato: string } | undefined;
      if (!portal) return respostaErro(`Portal "${portalSlug}" não encontrado`, 404);
      formato = portal.formato;
    }

    if (formato !== "vrsync-xml") {
      return respostaErro(`Formato "${formato}" ainda não possui mapeador de exportação implementado`, 501);
    }

    const resultado = await env.DB
      .prepare(
        `SELECT a.*, tn.slug as tipo_negocio_slug, ci.slug as categoria_slug,
                ti.slug as tipo_imovel_slug, cid.nome as cidade_nome
         FROM anuncios a
         JOIN tipos_negocio tn ON tn.id = a.tipo_negocio_id
         JOIN categorias_imovel ci ON ci.id = a.categoria_imovel_id
         JOIN tipos_imovel ti ON ti.id = a.tipo_imovel_id
         JOIN cidades cid ON cid.id = a.cidade_id
         WHERE a.corretor_id = ? AND a.postar_na_rede = 1 AND a.vendido_removido = 0
         ORDER BY a.criado_em DESC`
      )
      .bind(corretorId)
      .all();

    const linhas = (resultado.results || []) as unknown as LinhaExportacao[];

    // Só exporta anúncios que passam na validação de campos obrigatórios do
    // portal (mesma checagem usada no feed automático — seção 4.11)
    const linhasValidas = linhas.filter((a) => validarCamposObrigatorios(a.tipo_imovel_slug, a).valido);

    const xml = construirXMLVRSync(linhasValidas);

    return new Response(xml, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "content-disposition": `attachment; filename="anuncios-${portalSlug}.xml"`,
      },
    });
  } catch (erro) {
    console.error(`Erro ao exportar anúncios para "${portalSlug}":`, erro);
    return respostaErro("Erro ao gerar exportação", 500);
  }
}

// ========== Roteador ==========

export async function rotasAnunciosBackup(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const caminho = url.pathname;

  if (caminho === "/api/anuncios/backup") {
    return handleBackup(request, env);
  }

  if (caminho === "/api/anuncios/restaurar") {
    return handleRestaurar(request, env);
  }

  const matchExportar = caminho.match(/^\/api\/anuncios\/exportar\/([a-z0-9-]+)$/);
  if (matchExportar) {
    return handleExportar(request, env, matchExportar[1]);
  }

  return respostaErro("Rota não encontrada", 404);
}
