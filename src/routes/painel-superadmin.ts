// Rotas do painel do Superadmin — APIs para aprovações, cidades, módulos, visão geral
// Conforme seção 6 e Lote 9 do project.md
// POST/GET /api/painel-admin/*
//
// Prefixo /api/painel-admin/* — deliberadamente separado de /painel-admin/*
// (o shell estático em public/painel-admin/index.html, servido via
// env.ASSETS.fetch por routes/portal.ts). Mesmo motivo da separação em
// routes/painel-corretor.ts: antes as duas coisas dividiam o mesmo
// prefixo e o HTML do shell nunca era servido. Ver auditoria de fluxo completo.

import { Env } from "../index";
import { enfileirarStatusMinisite } from "../jobs/gerar-status-minisite";
import { sincronizarElegibilidadePortal } from "../modulos/pwa/logica";
import {
  listarPreCadastrosPendentes,
  buscarPreCadastro,
  aprovarPreCadastro,
  reprovarPreCadastro,
  listarMinisites,
  alternarOfflineMinisite,
  atualizarDadosCompletosMinisite,
  criarCorretorPeloSuperadmin,
  listarCidades,
  buscarCidade,
  atualizarCidade,
  listarModulos,
  alternarModulo,
  obterVisaoGeralRede,
  listarPortaisIndependentes,
  buscarPortalIndependente,
  alternarPortalIndependente,
  criarPortalIndependente,
  atualizarPortalIndependente,
} from "../db/queries-superadmin";
import { obterSuperadminIdDaSessao, respostaErro, respostaSucesso } from "../lib/painel-admin-auth";
import { rotasPainelSuperadminPlanos } from "./painel-superadmin-planos";
import { rotasPainelSuperadminIsencao } from "./painel-superadmin-isencao";

// ========== Rotas: Pré-Cadastros ==========

// GET /api/painel-admin/pre-cadastros — lista pendentes
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

// GET /api/painel-admin/pre-cadastro/:id — detalhes
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

// POST /api/painel-admin/pre-cadastro/:id/aprovar — aprova
async function rotaAprovarPreCadastro(request: Request, env: Env, id: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "POST") return respostaErro("Método não permitido", 405);

  try {
    // O minisite já existe (criado offline no pré-cadastro, com slug
    // auto-gerado a partir do nome) — slug_minisite aqui é opcional,
    // só usado se o Superadmin quiser sobrescrever o slug na aprovação.
    let slugMinisite: string | undefined;
    try {
      const body = await request.json() as { slug_minisite?: string };
      slugMinisite = body?.slug_minisite?.trim() || undefined;
    } catch {
      slugMinisite = undefined;
    }

    const { sucesso, slug: slugAprovado } = await aprovarPreCadastro(env.DB, id, slugMinisite);
    if (!sucesso) return respostaErro("Erro ao aprovar pré-cadastro", 500);

    // Materializa tenants/{slug}/status.json (liberado=true) — ver
    // jobs/gerar-status-minisite.ts. routes/minisite.ts lê daqui, nunca
    // consulta D1 no caminho público.
    if (slugAprovado) {
      await enfileirarStatusMinisite(env, slugAprovado);
    }

    return respostaSucesso({ mensagem: "Pré-cadastro aprovado com sucesso" });
  } catch {
    return respostaErro("Erro ao processar aprovação", 500);
  }
}

// POST /api/painel-admin/pre-cadastro/:id/reprovar — reprova
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

// ========== Rotas: Minisites (gestão completa da rede) ==========

// GET /api/painel-admin/minisites — lista todos, com busca e paginação
async function rotaListarMinisites(request: Request, env: Env): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const url = new URL(request.url);
    const pagina = parseInt(url.searchParams.get("pagina") || "1");
    const busca = url.searchParams.get("busca") || undefined;
    const limite = 50;
    const offset = (pagina - 1) * limite;

    const { dados, total } = await listarMinisites(env.DB, { busca, limite, offset });

    return respostaSucesso({ dados, total, pagina });
  } catch {
    return respostaErro("Erro ao listar minisites", 500);
  }
}

// POST /api/painel-admin/minisites — cria corretor + minisite completos,
// direto pelo Superadmin (sem passar pelo formulário público)
async function rotaCriarMinisite(request: Request, env: Env): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "POST") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as {
      nome?: string; email?: string; telefone?: string; creci?: string; cpf?: string;
      nome_usuario?: string; senha?: string; sexo?: string; data_nascimento?: string;
      nacionalidade?: string; endereco_residencial?: string; slug?: string; ja_aprovado?: boolean;
    };

    if (!body.nome || !body.email || !body.telefone || !body.creci || !body.cpf ||
        !body.sexo || !body.data_nascimento || !body.nacionalidade || !body.endereco_residencial) {
      return respostaErro("Preencha todos os campos obrigatórios");
    }

    const resultado = await criarCorretorPeloSuperadmin(env.DB, {
      nome: body.nome,
      email: body.email,
      telefone: body.telefone,
      creci: body.creci,
      cpf: body.cpf,
      nome_usuario: body.nome_usuario,
      senha: body.senha,
      sexo: body.sexo,
      data_nascimento: body.data_nascimento,
      nacionalidade: body.nacionalidade,
      endereco_residencial: body.endereco_residencial,
      slug: body.slug,
      ja_aprovado: body.ja_aprovado === true,
    });

    if (!resultado.sucesso) return respostaErro(resultado.erro || "Erro ao criar corretor", 409);

    // Mesmo gate de materialização das demais rotas desta tela: todo
    // minisite (pendente ou já aprovado) precisa de
    // tenants/{slug}/status.json em R2 assim que existe — mesmo
    // comportamento do pré-cadastro público (routes/api-auth-cadastro.ts),
    // que enfileira mesmo quando offline=true (liberado=false).
    if (resultado.slug) {
      await enfileirarStatusMinisite(env, resultado.slug);
    }

    return respostaSucesso({
      mensagem: "Corretor criado com sucesso",
      corretor_id: resultado.corretor_id,
      slug: resultado.slug,
      nome_usuario: resultado.nome_usuario,
      senha_gerada: resultado.senha_gerada,
    });
  } catch {
    return respostaErro("Erro ao processar criação", 500);
  }
}

// PATCH /api/painel-admin/minisite/:corretorId/status — suspende/reativa
// (não se aplica a pré-cadastros — usar /pre-cadastro/:id/aprovar pra esses)
async function rotaAlternarStatusMinisite(request: Request, env: Env, corretorId: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "PATCH") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as { offline?: boolean };
    if (body.offline === undefined) return respostaErro("offline é obrigatório");

    const { sucesso, slug } = await alternarOfflineMinisite(env.DB, corretorId, body.offline);
    if (!sucesso) {
      return respostaErro("Erro ao alterar status do minisite (corretor precisa estar aprovado)", 500);
    }

    // Mesmo gate de materialização de rotaAprovarPreCadastro acima:
    // qualquer troca de `offline` precisa refletir em
    // tenants/{slug}/status.json — R2 é a única fonte lida no caminho
    // público (routes/minisite.ts), nunca D1.
    if (slug) {
      await enfileirarStatusMinisite(env, slug);
    }

    return respostaSucesso({ mensagem: body.offline ? "Minisite suspenso" : "Minisite reativado" });
  } catch {
    return respostaErro("Erro ao processar alteração de status", 500);
  }
}

// PATCH /api/painel-admin/minisite/:corretorId — edita nome, CPF, CRECI,
// e-mail, telefone, endereço e/ou slug (todos opcionais — atualiza só o
// que veio no corpo)
async function rotaAtualizarMinisite(request: Request, env: Env, corretorId: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "PATCH") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as {
      nome?: string; cpf?: string; creci?: string; email?: string;
      telefone?: string; endereco_residencial?: string; slug?: string;
    };

    if (Object.values(body).every((v) => !v?.toString().trim())) {
      return respostaErro("Informe ao menos um campo para atualizar");
    }

    const resultado = await atualizarDadosCompletosMinisite(env.DB, corretorId, body);
    if (!resultado.sucesso) return respostaErro(resultado.erro || "Erro ao atualizar dados", 409);

    // Slug mudou: rematerializa status.json na chave nova (R2 é indexado
    // por slug — ver jobs/gerar-status-minisite.ts).
    if (resultado.slug) {
      await enfileirarStatusMinisite(env, resultado.slug);
    }

    return respostaSucesso({ mensagem: "Dados atualizados com sucesso" });
  } catch {
    return respostaErro("Erro ao processar atualização", 500);
  }
}

// ========== Rotas: Cidades ==========

// GET /api/painel-admin/cidades — lista
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

// GET /api/painel-admin/cidade/:id — detalhes
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

// PATCH /api/painel-admin/cidade/:id — atualiza
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

// GET /api/painel-admin/modulos — lista
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

// PATCH /api/painel-admin/modulo/:id — ativa/desativa
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

    // Domínio raiz do PWA não depende de plano — só desta flag de rede
    // (seção 4.18) — então regrava pwa/portal/elegibilidade.json aqui
    // mesmo, sem esperar um job. modulos/pwa/rota.ts lê só esse artefato,
    // nunca D1, no caminho público.
    if (moduloAtualizado?.slug === "pwa") {
      await sincronizarElegibilidadePortal(env, moduloAtualizado.ativo);
    }

    return respostaSucesso(moduloAtualizado);
  } catch {
    return respostaErro("Erro ao processar alternância", 500);
  }
}

// ========== Rotas: Portais Independentes (Lote 12.2) ==========

// GET /api/painel-admin/portais-independentes — lista
async function rotaListarPortaisIndependentes(request: Request, env: Env): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const portais = await listarPortaisIndependentes(env.DB);
    return respostaSucesso({ dados: portais });
  } catch {
    return respostaErro("Erro ao listar portais independentes", 500);
  }
}

// GET /api/painel-admin/portal-independente/:id — detalhes
async function rotaBuscarPortalIndependente(request: Request, env: Env, id: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const portal = await buscarPortalIndependente(env.DB, id);
    if (!portal) return respostaErro("Portal não encontrado", 404);

    return respostaSucesso({ dados: portal });
  } catch {
    return respostaErro("Erro ao buscar portal independente", 500);
  }
}

// POST /api/painel-admin/portais-independentes — cria
async function rotaCriarPortalIndependente(request: Request, env: Env): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "POST") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as any;

    if (!body.nome?.trim() || !body.slug?.trim() || !body.formato?.trim()) {
      return respostaErro("nome, slug e formato são obrigatórios");
    }

    const sucesso = await criarPortalIndependente(env.DB, {
      nome: body.nome.trim(),
      slug: body.slug.trim(),
      formato: body.formato.trim(),
      descricao: body.descricao?.trim(),
    });

    if (!sucesso) return respostaErro("Erro ao criar portal", 500);

    return respostaSucesso({ mensagem: "Portal criado com sucesso" });
  } catch {
    return respostaErro("Erro ao processar criação", 500);
  }
}

// PATCH /api/painel-admin/portal-independente/:id — ativa/desativa
async function rotaAlternarPortalIndependente(request: Request, env: Env, id: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "PATCH") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as any;

    if (body.ativo === undefined) {
      return respostaErro("ativo é obrigatório");
    }

    const sucesso = await alternarPortalIndependente(env.DB, id, body.ativo);
    if (!sucesso) return respostaErro("Erro ao alterar portal", 500);

    const portal = await buscarPortalIndependente(env.DB, id);
    return respostaSucesso(portal);
  } catch {
    return respostaErro("Erro ao processar alternância", 500);
  }
}

// PUT /api/painel-admin/portal-independente/:id — atualiza
async function rotaAtualizarPortalIndependente(request: Request, env: Env, id: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "PUT") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as any;

    const sucesso = await atualizarPortalIndependente(env.DB, id, {
      nome: body.nome?.trim(),
      slug: body.slug?.trim(),
      formato: body.formato?.trim(),
      descricao: body.descricao?.trim(),
    });

    if (!sucesso) return respostaErro("Erro ao atualizar portal", 500);

    const portal = await buscarPortalIndependente(env.DB, id);
    return respostaSucesso(portal);
  } catch {
    return respostaErro("Erro ao processar atualização", 500);
  }
}

// ========== Rotas: Visão Geral ==========

// GET /api/painel-admin/visao-geral — estatísticas da rede
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
  const pathname = url.pathname.replace(/^\/api\/painel-admin/, "");

  // GET /api/painel-admin/pre-cadastros
  if (pathname === "/pre-cadastros" && request.method === "GET") {
    return rotaListarPreCadastros(request, env);
  }

  // GET /api/painel-admin/pre-cadastro/:id
  const matchPreCadastro = pathname.match(/^\/pre-cadastro\/(\d+)$/);
  if (matchPreCadastro && request.method === "GET") {
    return rotaBuscarPreCadastro(request, env, parseInt(matchPreCadastro[1]));
  }

  // POST /api/painel-admin/pre-cadastro/:id/aprovar
  const matchAprovar = pathname.match(/^\/pre-cadastro\/(\d+)\/aprovar$/);
  if (matchAprovar && request.method === "POST") {
    return rotaAprovarPreCadastro(request, env, parseInt(matchAprovar[1]));
  }

  // POST /api/painel-admin/pre-cadastro/:id/reprovar
  const matchReprovar = pathname.match(/^\/pre-cadastro\/(\d+)\/reprovar$/);
  if (matchReprovar && request.method === "POST") {
    return rotaReprovarPreCadastro(request, env, parseInt(matchReprovar[1]));
  }

  // GET /api/painel-admin/minisites
  if (pathname === "/minisites" && request.method === "GET") {
    return rotaListarMinisites(request, env);
  }

  // POST /api/painel-admin/minisites
  if (pathname === "/minisites" && request.method === "POST") {
    return rotaCriarMinisite(request, env);
  }

  // PATCH /api/painel-admin/minisite/:corretorId/status
  const matchStatusMinisite = pathname.match(/^\/minisite\/(\d+)\/status$/);
  if (matchStatusMinisite && request.method === "PATCH") {
    return rotaAlternarStatusMinisite(request, env, parseInt(matchStatusMinisite[1]));
  }

  // PATCH /api/painel-admin/minisite/:corretorId
  const matchAtualizarMinisite = pathname.match(/^\/minisite\/(\d+)$/);
  if (matchAtualizarMinisite && request.method === "PATCH") {
    return rotaAtualizarMinisite(request, env, parseInt(matchAtualizarMinisite[1]));
  }

  // GET /api/painel-admin/cidades
  if (pathname === "/cidades" && request.method === "GET") {
    return rotaListarCidades(request, env);
  }

  // GET /api/painel-admin/cidade/:id
  const matchCidade = pathname.match(/^\/cidade\/(\d+)$/);
  if (matchCidade && request.method === "GET") {
    return rotaBuscarCidade(request, env, parseInt(matchCidade[1]));
  }

  // PATCH /api/painel-admin/cidade/:id
  const matchAtualizarCidade = pathname.match(/^\/cidade\/(\d+)$/);
  if (matchAtualizarCidade && request.method === "PATCH") {
    return rotaAtualizarCidade(request, env, parseInt(matchAtualizarCidade[1]));
  }

  // GET /api/painel-admin/modulos
  if (pathname === "/modulos" && request.method === "GET") {
    return rotaListarModulos(request, env);
  }

  // PATCH /api/painel-admin/modulo/:id
  const matchModulo = pathname.match(/^\/modulo\/(\d+)$/);
  if (matchModulo && request.method === "PATCH") {
    return rotaAlternarModulo(request, env, parseInt(matchModulo[1]));
  }

  // GET /api/painel-admin/portais-independentes
  if (pathname === "/portais-independentes" && request.method === "GET") {
    return rotaListarPortaisIndependentes(request, env);
  }

  // POST /api/painel-admin/portais-independentes
  if (pathname === "/portais-independentes" && request.method === "POST") {
    return rotaCriarPortalIndependente(request, env);
  }

  // GET /api/painel-admin/portal-independente/:id
  const matchPortal = pathname.match(/^\/portal-independente\/(\d+)$/);
  if (matchPortal && request.method === "GET") {
    return rotaBuscarPortalIndependente(request, env, parseInt(matchPortal[1]));
  }

  // PATCH /api/painel-admin/portal-independente/:id
  const matchAlternarPortal = pathname.match(/^\/portal-independente\/(\d+)$/);
  if (matchAlternarPortal && request.method === "PATCH") {
    return rotaAlternarPortalIndependente(request, env, parseInt(matchAlternarPortal[1]));
  }

  // PUT /api/painel-admin/portal-independente/:id
  const matchAtualizarPortal = pathname.match(/^\/portal-independente\/(\d+)$/);
  if (matchAtualizarPortal && request.method === "PUT") {
    return rotaAtualizarPortalIndependente(request, env, parseInt(matchAtualizarPortal[1]));
  }

  // GET /api/painel-admin/visao-geral
  if (pathname === "/visao-geral" && request.method === "GET") {
    return rotaVisaoGeral(request, env);
  }

  // ========== Rotas: Planos (Lote 14 — ver painel-superadmin-planos.ts) ==========
  if (
    pathname === "/planos" ||
    pathname.match(/^\/plano\/\d+(\/desativar)?$/) ||
    pathname.match(/^\/corretor\/\d+\/trocar-plano$/) ||
    pathname === "/promocao-lancamento/contador"
  ) {
    return rotasPainelSuperadminPlanos(request, env, pathname);
  }

  // ========== Rotas: Isenção (Lote 14 — ver painel-superadmin-isencao.ts) ==========
  if (pathname === "/isencoes" || pathname.match(/^\/corretor\/\d+\/isencao(\/log)?$/)) {
    return rotasPainelSuperadminIsencao(request, env, pathname);
  }

  return new Response("Rota não encontrada", { status: 404 });
}
