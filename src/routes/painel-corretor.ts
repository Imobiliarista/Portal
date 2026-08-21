// Rotas do painel do corretor — APIs de suporte para dashboard, perfil, anúncios, cotas
// Conforme seção 6.1 e Lote 8 do project.md
//
// Prefixo /api/painel-corretor/* — deliberadamente separado de /painel/*
// (o shell estático em public/painel/index.html, servido via
// env.ASSETS.fetch por routes/portal.ts). Antes as duas coisas dividiam o
// mesmo prefixo /painel/* e o roteador de API interceptava tudo, então o
// HTML do shell nunca era servido. Ver auditoria de fluxo completo.

import { Env } from "../index";
import { buscarCorretorPorId, atualizarPerfilEditavelDoCorretor, buscarPlanoDoCorretor, buscarConfigUploadDoCorretor, buscarMinisiteDoCorretor } from "../db/queries-perfil";
import { listarAnunciosDoCorretor, contarAnunciosAtivosDoCorretor } from "../db/queries-anuncios";
import { listarCotasPortalDoCorretor, atualizarCotaPortal, contarAnunciosElegiveisParaPortal } from "../db/queries-cotas-portal";
import { buscarTaxonomiaCompleta } from "../db/queries-taxonomia";
import { rotaAgendamentoVisita } from "../modulos/agendamento-visita/rota";
import { estaModuloAtivo } from "../db/queries-modulos";
import {
  buscarConfigPublicacoesDoCorretor,
  salvarConfigPublicacoesDoCorretor,
  validarConfigPublicacoes,
} from "../modulos/publicacoes/logica";

// ========== Auxiliares ==========

// Extrai ID do corretor da sessão (cookie)
async function obterCorretorIdDaSessao(request: Request, env: Env): Promise<number | null> {
  const cookie = request.headers.get("cookie") || "";
  const sessionIdMatch = cookie.match(/session_id=([^;]+)/);

  if (!sessionIdMatch) return null;

  const sessionId = sessionIdMatch[1];

  try {
    const sessao = await env.DB.prepare("SELECT corretor_id, expira_em FROM sessoes WHERE session_id = ? LIMIT 1")
      .bind(sessionId)
      .first() as { corretor_id: number; expira_em: string } | null;

    // Comparação como Date (epoch ms), nunca como string — ver
    // src/lib/sessao.ts::obterCorretorAutenticado e o Histórico de Decisões
    // em project.md pro bug original (~24h de graça além do TTL).
    if (!sessao || new Date(sessao.expira_em) <= new Date()) {
      return null;
    }

    return sessao.corretor_id;
  } catch {
    return null;
  }
}

// Resposta de erro padrão
function respostaErro(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ erro: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Resposta de sucesso
function respostaSucesso(dados: any): Response {
  return new Response(JSON.stringify(dados), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ========== Rota: GET /api/painel-corretor/perfil ==========

async function rotaPainelPerfil(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return respostaErro("Método não permitido", 405);

  const corretor_id = await obterCorretorIdDaSessao(request, env);
  if (!corretor_id) return respostaErro("Não autenticado", 401);

  try {
    const corretor = await buscarCorretorPorId(env.DB, corretor_id);
    if (!corretor) return respostaErro("Corretor não encontrado", 404);

    const minisite = await buscarMinisiteDoCorretor(env.DB, corretor_id);
    const plano = await buscarPlanoDoCorretor(env.DB, corretor_id);
    const configUpload = await buscarConfigUploadDoCorretor(env.DB, corretor_id);

    // Monta resposta sem dados sensíveis
    return respostaSucesso({
      id: corretor.id,
      nome_completo: corretor.nome_completo,
      cpf: corretor.cpf,
      creci: corretor.creci,
      sexo: corretor.sexo,
      data_nascimento: corretor.data_nascimento,
      nacionalidade: corretor.nacionalidade,
      email: corretor.email,
      telefone: corretor.telefone,
      whatsapp: corretor.whatsapp,
      endereco_residencial: corretor.endereco_residencial,
      status: corretor.status,
      minisite_slug: minisite?.slug,
      minisite_offline: minisite?.offline,
      plano: plano ? {
        nome: plano.nome,
        max_anuncios: plano.max_anuncios,
        max_fotos_por_anuncio: plano.max_fotos_por_anuncio,
        permite_pwa: plano.permite_pwa,
        permite_publicacoes: plano.permite_publicacoes,
        google_maps_api_key: configUpload?.google_maps_api_key ? "***" : null,
      } : null,
    });
  } catch (erro) {
    console.error("Erro ao buscar perfil:", erro);
    return respostaErro("Erro ao buscar perfil", 500);
  }
}

// ========== Rota: PUT /api/painel-corretor/perfil/editar ==========

async function rotaPainelPerfilEditar(request: Request, env: Env): Promise<Response> {
  if (request.method !== "PUT") return respostaErro("Método não permitido", 405);

  const corretor_id = await obterCorretorIdDaSessao(request, env);
  if (!corretor_id) return respostaErro("Não autenticado", 401);

  try {
    const corpo = await request.json() as any;

    // Valida quais campos podem ser editados
    const campos_editaveis = {
      endereco_residencial: corpo.endereco_residencial,
      telefone: corpo.telefone,
      email: corpo.email,
      whatsapp: corpo.whatsapp,
    };

    await atualizarPerfilEditavelDoCorretor(env.DB, corretor_id, campos_editaveis);

    return respostaSucesso({ mensagem: "Perfil atualizado com sucesso" });
  } catch (erro) {
    console.error("Erro ao atualizar perfil:", erro);
    return respostaErro("Erro ao atualizar perfil", 500);
  }
}

// ========== Rota: GET /api/painel-corretor/plano ==========

async function rotaPainelPlano(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return respostaErro("Método não permitido", 405);

  const corretor_id = await obterCorretorIdDaSessao(request, env);
  if (!corretor_id) return respostaErro("Não autenticado", 401);

  try {
    const plano = await buscarPlanoDoCorretor(env.DB, corretor_id);
    const configUpload = await buscarConfigUploadDoCorretor(env.DB, corretor_id);

    // Conta uso atual
    const anuncios_ativos = await contarAnunciosAtivosDoCorretor(env.DB, corretor_id);

    // Corretor sem plano_id atribuído (ex.: cadastro anterior ao Sistema
    // de Planos, migration 0010) é um estado válido, não um erro — mesmo
    // tratamento de "ausência de dado" já usado em rotaPainelPerfil acima.
    // Nunca 404 por isso: o front-end precisa distinguir "sem plano" de
    // "rota não encontrada".
    return respostaSucesso({
      plano: plano ? {
        nome: plano.nome,
        max_anuncios: plano.max_anuncios,
        max_fotos_por_anuncio: plano.max_fotos_por_anuncio,
        permite_pwa: plano.permite_pwa,
        permite_publicacoes: plano.permite_publicacoes,
      } : null,
      anuncios_usados: anuncios_ativos,
      google_maps_key_configurada: !!configUpload?.google_maps_api_key,
    });
  } catch (erro) {
    console.error("Erro ao buscar plano:", erro);
    return respostaErro("Erro ao buscar plano", 500);
  }
}

// ========== Rota: GET /api/painel-corretor/anuncios ==========

async function rotaPainelAnuncios(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return respostaErro("Método não permitido", 405);

  const corretor_id = await obterCorretorIdDaSessao(request, env);
  if (!corretor_id) return respostaErro("Não autenticado", 401);

  try {
    const url = new URL(request.url);
    const pagina = parseInt(url.searchParams.get("pagina") || "1", 10);

    const { anuncios, total } = await listarAnunciosDoCorretor(env.DB, corretor_id, pagina, 10);

    return respostaSucesso({
      anuncios,
      total,
      pagina,
      per_page: 10,
    });
  } catch (erro) {
    console.error("Erro ao listar anúncios:", erro);
    return respostaErro("Erro ao listar anúncios", 500);
  }
}

// ========== Rota: GET /api/painel-corretor/taxonomia ==========
// Tipos de negócio, categorias→tipos de imóvel e cidades pro formulário
// de anúncio — antes disso, o formulário só tinha 4 opções de tipo de
// imóvel e 3 cidades hardcoded em painel.js, sem relação com o banco.

async function rotaPainelTaxonomia(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return respostaErro("Método não permitido", 405);

  const corretor_id = await obterCorretorIdDaSessao(request, env);
  if (!corretor_id) return respostaErro("Não autenticado", 401);

  try {
    const taxonomia = await buscarTaxonomiaCompleta(env.DB);
    return respostaSucesso(taxonomia);
  } catch (erro) {
    console.error("Erro ao buscar taxonomia:", erro);
    return respostaErro("Erro ao buscar taxonomia", 500);
  }
}

// ========== Rota: GET /api/painel-corretor/cotas-portal ==========

async function rotaPainelCotasPortal(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return respostaErro("Método não permitido", 405);

  const corretor_id = await obterCorretorIdDaSessao(request, env);
  if (!corretor_id) return respostaErro("Não autenticado", 401);

  try {
    const cotas = await listarCotasPortalDoCorretor(env.DB, corretor_id);
    const totalElegivel = await contarAnunciosElegiveisParaPortal(env.DB, corretor_id);

    // Formata resposta com contadores
    const cotasComContador = cotas.map((cota) => ({
      ...cota,
      contador: cota.quantidade_contratada ? `${Math.min(totalElegivel, cota.quantidade_contratada)}/${cota.quantidade_contratada}` : "Ilimitado",
      total_elegivel: totalElegivel,
    }));

    return respostaSucesso({
      cotas: cotasComContador,
      total_elegivel: totalElegivel,
    });
  } catch (erro) {
    console.error("Erro ao listar cotas de portal:", erro);
    return respostaErro("Erro ao listar cotas", 500);
  }
}

// ========== Rota: PUT /api/painel-corretor/cotas-portal ==========

async function rotaPainelCotasPortalAtualizar(request: Request, env: Env): Promise<Response> {
  if (request.method !== "PUT") return respostaErro("Método não permitido", 405);

  const corretor_id = await obterCorretorIdDaSessao(request, env);
  if (!corretor_id) return respostaErro("Não autenticado", 401);

  try {
    const corpo = await request.json() as any;

    if (!corpo.portal_nome) return respostaErro("portal_nome é obrigatório");

    const ativo = corpo.ativo === true;

    await atualizarCotaPortal(env.DB, corretor_id, corpo.portal_nome, {
      quantidade_contratada: corpo.quantidade_contratada === null || corpo.quantidade_contratada === undefined
        ? null
        : parseInt(corpo.quantidade_contratada, 10),
      ativo,
    });

    // Sem isso, o primeiro corretor a ligar uma cota ficaria sem feed
    // nenhum até editar algum anúncio depois — jobs/revalidacao-cruzada.ts
    // só regenera feeds de portais já ativos no momento da mutação do
    // anúncio, não cobre o instante em que a cota é ligada pela primeira
    // vez. Mesmo achado do §0 da reconstrução do feed (disparo nunca
    // existia antes desta correção).
    if (ativo) {
      const minisite = await buscarMinisiteDoCorretor(env.DB, corretor_id);
      if (minisite) {
        try {
          await env.FILA_ALTERACOES.send({
            tipo: "gerar-feed-portal-independente",
            corretor_slug: minisite.slug,
            portal_slug: corpo.portal_nome,
          });
        } catch (erroFila) {
          console.error(`Falha ao enfileirar geração inicial do feed "${corpo.portal_nome}":`, erroFila);
        }
      }
    }

    return respostaSucesso({ mensagem: "Cota atualizada com sucesso" });
  } catch (erro) {
    console.error("Erro ao atualizar cota:", erro);
    return respostaErro("Erro ao atualizar cota", 500);
  }
}

// ========== Rota: GET /api/painel-corretor/publicacoes ==========
// Controle duplo do módulo Publicações (Lote 16, seção 4.19)

async function rotaPainelPublicacoes(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return respostaErro("Método não permitido", 405);

  const corretor_id = await obterCorretorIdDaSessao(request, env);
  if (!corretor_id) return respostaErro("Não autenticado", 401);

  try {
    const plano = await buscarPlanoDoCorretor(env.DB, corretor_id);
    const moduloAtivoNaRede = await estaModuloAtivo(env.DB, "publicacoes");
    const config = await buscarConfigPublicacoesDoCorretor(env.DB, corretor_id);

    return respostaSucesso({
      permitido_pelo_plano: !!plano?.permite_publicacoes,
      modulo_ativo_na_rede: moduloAtivoNaRede,
      config,
    });
  } catch (erro) {
    console.error("Erro ao buscar configuração de Publicações:", erro);
    return respostaErro("Erro ao buscar configuração de Publicações", 500);
  }
}

// ========== Rota: PUT /api/painel-corretor/publicacoes ==========

async function rotaPainelPublicacoesAtualizar(request: Request, env: Env): Promise<Response> {
  if (request.method !== "PUT") return respostaErro("Método não permitido", 405);

  const corretor_id = await obterCorretorIdDaSessao(request, env);
  if (!corretor_id) return respostaErro("Não autenticado", 401);

  try {
    const plano = await buscarPlanoDoCorretor(env.DB, corretor_id);
    if (!plano?.permite_publicacoes) {
      return respostaErro("Seu plano atual não inclui o módulo Publicações", 403);
    }

    const corpo = (await request.json()) as any;
    const dados = {
      ativo: corpo.ativo === true,
      usarFeedPadrao: corpo.usarFeedPadrao !== false,
      feedUrl: typeof corpo.feedUrl === "string" ? corpo.feedUrl : null,
    };

    const validacao = validarConfigPublicacoes(dados);
    if (!validacao.valido) return respostaErro(validacao.mensagem);

    await salvarConfigPublicacoesDoCorretor(env.DB, corretor_id, dados);

    return respostaSucesso({ mensagem: "Configuração de Publicações atualizada com sucesso" });
  } catch (erro) {
    console.error("Erro ao atualizar configuração de Publicações:", erro);
    return respostaErro("Erro ao atualizar configuração de Publicações", 500);
  }
}

// ========== Roteador principal ==========

export async function rotasPainelCorretor(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Todas as rotas do painel requerem autenticação
  const corretor_id = await obterCorretorIdDaSessao(request, env);
  if (!corretor_id) {
    return respostaErro("Não autenticado. Acesso ao painel requer login.", 401);
  }

  // Roteamento por pathname
  if (pathname === "/api/painel-corretor/perfil" && request.method === "GET") {
    return rotaPainelPerfil(request, env);
  }

  if (pathname === "/api/painel-corretor/perfil/editar" && request.method === "PUT") {
    return rotaPainelPerfilEditar(request, env);
  }

  if (pathname === "/api/painel-corretor/plano" && request.method === "GET") {
    return rotaPainelPlano(request, env);
  }

  if (pathname === "/api/painel-corretor/anuncios" && request.method === "GET") {
    return rotaPainelAnuncios(request, env);
  }

  if (pathname === "/api/painel-corretor/taxonomia" && request.method === "GET") {
    return rotaPainelTaxonomia(request, env);
  }

  if (pathname === "/api/painel-corretor/cotas-portal" && request.method === "GET") {
    return rotaPainelCotasPortal(request, env);
  }

  if (pathname === "/api/painel-corretor/cotas-portal" && request.method === "PUT") {
    return rotaPainelCotasPortalAtualizar(request, env);
  }

  // Módulo Publicações (Lote 16, seção 4.19)
  if (pathname === "/api/painel-corretor/publicacoes" && request.method === "GET") {
    return rotaPainelPublicacoes(request, env);
  }

  if (pathname === "/api/painel-corretor/publicacoes" && request.method === "PUT") {
    return rotaPainelPublicacoesAtualizar(request, env);
  }

  // Rotas de agendamento de visita (Lote 12.7)
  if (pathname.startsWith("/api/agendamento/")) {
    return rotaAgendamentoVisita(request, url, env, corretor_id);
  }

  return respostaErro("Rota não encontrada", 404);
}
