// Rotas do painel do Superadmin — APIs para aprovações, cidades, módulos, visão geral
// Conforme seção 6 e Lote 9 do project.md
// POST/GET /painel-admin/*

import { Env } from "../index";
import { listarPreCadastrosPendentes, buscarPreCadastro, aprovarPreCadastro, reprovarPreCadastro, listarCidades, buscarCidade, atualizarCidade, listarModulos, alternarModulo, obterVisaoGeralRede } from "../db/queries-superadmin";

// ========== Auxiliares ==========

// Extrai ID do Superadmin da sessão (cookie)
async function obterSuperadminIdDaSessao(request: Request, env: Env): Promise<number | null> {
  const cookie = request.headers.get("cookie") || "";
  const sessionIdMatch = cookie.match(/session_id=([^;]+)/);

  if (!sessionIdMatch) return null;

  const sessionId = sessionIdMatch[1];

  try {
    const sessao = await env.DB.prepare(
      "SELECT c.id FROM sessoes s JOIN corretores c ON s.corretor_id = c.id WHERE s.session_id = ? AND s.expira_em > datetime('now') AND c.papel = 'superadmin' LIMIT 1"
    ).bind(sessionId).first() as { id: number } | null;

    return sessao?.id || null;
  } catch {
    return null;
  }
}

// Resposta de erro padrão
function respostaErro(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ erro: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Resposta de sucesso
function respostaSucesso(dados: any): Response {
  return new Response(JSON.stringify(dados), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// ========== Rotas: Pré-Cadastros ==========

// GET /painel-admin/pre-cadastros — lista pendentes
async function rotaListarPreCadastros(request: Request, env: Env): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const url = new URL(request.url);
    const pagina = parseInt(url.searchParams.get("pagina") || "1");
    const limite = 50;
    const offset = (pagina - 1) * limite;

    const precadastros = await listarPreCadastrosPendentes(env.DB, limite, offset);

    return respostaSucesso({ dados: precadastros, pagina });
  } catch {
    return respostaErro("Erro ao listar pré-cadastros", 500);
  }
}

// GET /painel-admin/pre-cadastro/:id — detalhes
async function rotaBuscarPreCadastro(request: Request, env: Env, id: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const precadastro = await buscarPreCadastro(env.DB, id);
    if (!precadastro) return respostaErro("Pré-cadastro não encontrado", 404);

    return respostaSucesso({ dados: precadastro });
  } catch {
    return respostaErro("Erro ao buscar pré-cadastro", 500);
  }
}

// POST /painel-admin/pre-cadastro/:id/aprovar — aprova
async function rotaAprovarPreCadastro(request: Request, env: Env, id: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "POST") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as { slug_minisite: string };
    if (!body.slug_minisite?.trim()) {
      return respostaErro("slug_minisite é obrigatório");
    }

    const sucesso = await aprovarPreCadastro(env.DB, id, body.slug_minisite.trim());
    if (!sucesso) return respostaErro("Erro ao aprovar pré-cadastro", 500);

    return respostaSucesso({ mensagem: "Pré-cadastro aprovado com sucesso" });
  } catch {
    return respostaErro("Erro ao processar aprovação", 500);
  }
}

// POST /painel-admin/pre-cadastro/:id/reprovar — reprova
async function rotaReprovarPreCadastro(request: Request, env: Env, id: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "POST") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as { motivo?: string };

    const sucesso = await reprovarPreCadastro(env.DB, id, body.motivo);
    if (!sucesso) return respostaErro("Erro ao reprovar pré-cadastro", 500);

    return respostaSucesso({ mensagem: "Pré-cadastro reprovado com sucesso" });
  } catch {
    return respostaErro("Erro ao processar reprovação", 500);
  }
}

// ========== Rotas: Cidades ==========

// GET /painel-admin/cidades — lista
async function rotaListarCidades(request: Request, env: Env): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const url = new URL(request.url);
    const pagina = parseInt(url.searchParams.get("pagina") || "1");
    const limite = 100;
    const offset = (pagina - 1) * limite;

    const cidades = await listarCidades(env.DB, limite, offset);

    return respostaSucesso({ dados: cidades, pagina });
  } catch {
    return respostaErro("Erro ao listar cidades", 500);
  }
}

// GET /painel-admin/cidade/:id — detalhes
async function rotaBuscarCidade(request: Request, env: Env, id: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const cidade = await buscarCidade(env.DB, id);
    if (!cidade) return respostaErro("Cidade não encontrada", 404);

    return respostaSucesso({ dados: cidade });
  } catch {
    return respostaErro("Erro ao buscar cidade", 500);
  }
}

// PATCH /painel-admin/cidade/:id — atualiza
async function rotaAtualizarCidade(request: Request, env: Env, id: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "PATCH") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as { nome?: string; ativo?: boolean };

    const sucesso = await atualizarCidade(env.DB, id, body);
    if (!sucesso) return respostaErro("Erro ao atualizar cidade", 500);

    const cidadeAtualizada = await buscarCidade(env.DB, id);
    return respostaSucesso({ dados: cidadeAtualizada });
  } catch {
    return respostaErro("Erro ao processar atualização", 500);
  }
}

// ========== Rotas: Módulos ==========

// GET /painel-admin/modulos — lista
async function rotaListarModulos(request: Request, env: Env): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const modulos = await listarModulos(env.DB);

    return respostaSucesso({ dados: modulos });
  } catch {
    return respostaErro("Erro ao listar módulos", 500);
  }
}

// PATCH /painel-admin/modulo/:id — ativa/desativa
async function rotaAlternarModulo(request: Request, env: Env, id: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "PATCH") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as { ativo: boolean };
    if (body.ativo === undefined) {
      return respostaErro("ativo é obrigatório");
    }

    const sucesso = await alternarModulo(env.DB, id, body.ativo);
    if (!sucesso) return respostaErro("Erro ao alterar módulo", 500);

    const modulos = await listarModulos(env.DB);
    const moduloAtualizado = modulos.find(m => m.id === id);

    return respostaSucesso(moduloAtualizado);
  } catch {
    return respostaErro("Erro ao processar alternância", 500);
  }
}

// ========== Rotas: Visão Geral ==========

// GET /painel-admin/visao-geral — estatísticas da rede
async function rotaVisaoGeral(request: Request, env: Env): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const visao = await obterVisaoGeralRede(env.DB);
    if (!visao) return respostaErro("Erro ao obter visão geral", 500);

    return respostaSucesso(visao);
  } catch {
    return respostaErro("Erro ao buscar visão geral", 500);
  }
}

// ========== Roteador ==========

export async function rotasPainelSuperadmin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/^\/painel-admin/, "");

  // GET /painel-admin/pre-cadastros
  if (pathname === "/pre-cadastros" && request.method === "GET") {
    return rotaListarPreCadastros(request, env);
  }

  // GET /painel-admin/pre-cadastro/:id
  const matchPreCadastro = pathname.match(/^\/pre-cadastro\/(\d+)$/);
  if (matchPreCadastro && request.method === "GET") {
    return rotaBuscarPreCadastro(request, env, parseInt(matchPreCadastro[1]));
  }

  // POST /painel-admin/pre-cadastro/:id/aprovar
  const matchAprovar = pathname.match(/^\/pre-cadastro\/(\d+)\/aprovar$/);
  if (matchAprovar && request.method === "POST") {
    return rotaAprovarPreCadastro(request, env, parseInt(matchAprovar[1]));
  }

  // POST /painel-admin/pre-cadastro/:id/reprovar
  const matchReprovar = pathname.match(/^\/pre-cadastro\/(\d+)\/reprovar$/);
  if (matchReprovar && request.method === "POST") {
    return rotaReprovarPreCadastro(request, env, parseInt(matchReprovar[1]));
  }

  // GET /painel-admin/cidades
  if (pathname === "/cidades" && request.method === "GET") {
    return rotaListarCidades(request, env);
  }

  // GET /painel-admin/cidade/:id
  const matchCidade = pathname.match(/^\/cidade\/(\d+)$/);
  if (matchCidade && request.method === "GET") {
    return rotaBuscarCidade(request, env, parseInt(matchCidade[1]));
  }

  // PATCH /painel-admin/cidade/:id
  const matchAtualizarCidade = pathname.match(/^\/cidade\/(\d+)$/);
  if (matchAtualizarCidade && request.method === "PATCH") {
    return rotaAtualizarCidade(request, env, parseInt(matchAtualizarCidade[1]));
  }

  // GET /painel-admin/modulos
  if (pathname === "/modulos" && request.method === "GET") {
    return rotaListarModulos(request, env);
  }

  // PATCH /painel-admin/modulo/:id
  const matchModulo = pathname.match(/^\/modulo\/(\d+)$/);
  if (matchModulo && request.method === "PATCH") {
    return rotaAlternarModulo(request, env, parseInt(matchModulo[1]));
  }

  // GET /painel-admin/visao-geral
  if (pathname === "/visao-geral" && request.method === "GET") {
    return rotaVisaoGeral(request, env);
  }

  return new Response("Rota não encontrada", { status: 404 });
}
