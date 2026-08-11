// Rotas do painel do Superadmin — Gestão de Planos (Lote 14)
// CRUD de planos (6.3), troca de plano (6.4) e contador da Promoção de Lançamento (6.5)
// Conforme project.md, seções 5.1.3, 6.3, 6.4, 6.5
// Chamado a partir de routes/painel-superadmin.ts

import { Env } from "../index";
import { obterSuperadminIdDaSessao, respostaErro, respostaSucesso } from "../lib/painel-admin-auth";
import {
  listarPlanos,
  buscarPlano,
  criarPlano,
  atualizarPlano,
  desativarPlano,
  trocarPlanoDoCorretor,
  contarVagasPromocaoLancamento,
} from "../db/queries-planos";

// ========== Rotas: Planos ==========

// GET /painel-admin/planos — lista (?incluirInativos=1 traz também os desativados)
async function rotaListarPlanos(request: Request, env: Env): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const url = new URL(request.url);
    const incluirInativos = url.searchParams.get("incluirInativos") === "1";

    const planos = await listarPlanos(env.DB, incluirInativos);
    return respostaSucesso({ dados: planos });
  } catch {
    return respostaErro("Erro ao listar planos", 500);
  }
}

// GET /painel-admin/plano/:id — detalhes
async function rotaBuscarPlano(request: Request, env: Env, id: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const plano = await buscarPlano(env.DB, id);
    if (!plano) return respostaErro("Plano não encontrado", 404);

    return respostaSucesso({ dados: plano });
  } catch {
    return respostaErro("Erro ao buscar plano", 500);
  }
}

// POST /painel-admin/planos — cria
async function rotaCriarPlano(request: Request, env: Env): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "POST") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as any;

    if (!body.nome?.trim() || body.max_anuncios === undefined || body.max_fotos_por_anuncio === undefined ||
        body.taxa_adesao === undefined || body.preco_mensalidade === undefined) {
      return respostaErro("nome, max_anuncios, max_fotos_por_anuncio, taxa_adesao e preco_mensalidade são obrigatórios");
    }

    const id = await criarPlano(env.DB, {
      nome: body.nome.trim(),
      max_anuncios: Number(body.max_anuncios),
      max_fotos_por_anuncio: Number(body.max_fotos_por_anuncio),
      taxa_adesao: Number(body.taxa_adesao),
      preco_mensalidade: Number(body.preco_mensalidade),
      permite_pwa: !!body.permite_pwa,
      permite_publicacoes: !!body.permite_publicacoes,
      permite_api_google_maps: !!body.permite_api_google_maps,
    });

    if (!id) return respostaErro("Erro ao criar plano", 500);

    const plano = await buscarPlano(env.DB, id);
    return respostaSucesso({ dados: plano });
  } catch {
    return respostaErro("Erro ao processar criação", 500);
  }
}

// PUT /painel-admin/plano/:id — edita
async function rotaAtualizarPlano(request: Request, env: Env, id: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "PUT") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as any;

    const sucesso = await atualizarPlano(env.DB, id, {
      nome: body.nome?.trim(),
      max_anuncios: body.max_anuncios !== undefined ? Number(body.max_anuncios) : undefined,
      max_fotos_por_anuncio: body.max_fotos_por_anuncio !== undefined ? Number(body.max_fotos_por_anuncio) : undefined,
      taxa_adesao: body.taxa_adesao !== undefined ? Number(body.taxa_adesao) : undefined,
      preco_mensalidade: body.preco_mensalidade !== undefined ? Number(body.preco_mensalidade) : undefined,
      permite_pwa: body.permite_pwa !== undefined ? !!body.permite_pwa : undefined,
      permite_publicacoes: body.permite_publicacoes !== undefined ? !!body.permite_publicacoes : undefined,
      permite_api_google_maps: body.permite_api_google_maps !== undefined ? !!body.permite_api_google_maps : undefined,
    });

    if (!sucesso) return respostaErro("Erro ao atualizar plano", 500);

    const plano = await buscarPlano(env.DB, id);
    return respostaSucesso({ dados: plano });
  } catch {
    return respostaErro("Erro ao processar atualização", 500);
  }
}

// PATCH /painel-admin/plano/:id/desativar — desativa (não afeta corretores já no plano)
async function rotaDesativarPlano(request: Request, env: Env, id: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "PATCH") return respostaErro("Método não permitido", 405);

  try {
    const sucesso = await desativarPlano(env.DB, id);
    if (!sucesso) return respostaErro("Erro ao desativar plano", 500);

    const plano = await buscarPlano(env.DB, id);
    return respostaSucesso({ dados: plano });
  } catch {
    return respostaErro("Erro ao processar desativação", 500);
  }
}

// ========== Rota: Troca de Plano (6.4) ==========

// POST /painel-admin/corretor/:id/trocar-plano — { plano_id }
async function rotaTrocarPlano(request: Request, env: Env, corretorId: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "POST") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as { plano_id?: number };
    if (!body.plano_id) return respostaErro("plano_id é obrigatório");

    const resultado = await trocarPlanoDoCorretor(env.DB, corretorId, body.plano_id);
    if (!resultado.permitido) return respostaErro(resultado.mensagem || "Troca de plano bloqueada", 409);

    return respostaSucesso({ mensagem: "Plano atualizado com sucesso" });
  } catch {
    return respostaErro("Erro ao processar troca de plano", 500);
  }
}

// ========== Rota: Contador da Promoção de Lançamento (6.5) ==========

// GET /painel-admin/promocao-lancamento/contador
async function rotaContadorPromocaoLancamento(request: Request, env: Env): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const contador = await contarVagasPromocaoLancamento(env.DB);
    return respostaSucesso(contador);
  } catch {
    return respostaErro("Erro ao obter contador da promoção", 500);
  }
}

// ========== Roteador ==========

export async function rotasPainelSuperadminPlanos(request: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === "/planos" && request.method === "GET") {
    return rotaListarPlanos(request, env);
  }

  if (pathname === "/planos" && request.method === "POST") {
    return rotaCriarPlano(request, env);
  }

  const matchPlano = pathname.match(/^\/plano\/(\d+)$/);
  if (matchPlano && request.method === "GET") {
    return rotaBuscarPlano(request, env, parseInt(matchPlano[1]));
  }
  if (matchPlano && request.method === "PUT") {
    return rotaAtualizarPlano(request, env, parseInt(matchPlano[1]));
  }

  const matchDesativar = pathname.match(/^\/plano\/(\d+)\/desativar$/);
  if (matchDesativar && request.method === "PATCH") {
    return rotaDesativarPlano(request, env, parseInt(matchDesativar[1]));
  }

  const matchTrocarPlano = pathname.match(/^\/corretor\/(\d+)\/trocar-plano$/);
  if (matchTrocarPlano && request.method === "POST") {
    return rotaTrocarPlano(request, env, parseInt(matchTrocarPlano[1]));
  }

  if (pathname === "/promocao-lancamento/contador" && request.method === "GET") {
    return rotaContadorPromocaoLancamento(request, env);
  }

  return new Response("Rota não encontrada", { status: 404 });
}
