// Rotas do painel do Superadmin — Controle de Isenção de Cobrança genérico (Lote 14)
// Conceder/editar/revogar isenção de qualquer corretor, com log de auditoria
// Conforme project.md, seção 6.6
// Chamado a partir de routes/painel-superadmin.ts

import { Env } from "../index";
import { obterSuperadminIdDaSessao, respostaErro, respostaSucesso } from "../lib/painel-admin-auth";
import {
  listarCorretoresParaIsencao,
  concederOuEditarIsencao,
  revogarIsencao,
  listarLogIsencaoDoCorretor,
} from "../db/queries-isencao";

// GET /api/painel-admin/isencoes — lista corretores com dados de isenção
async function rotaListarIsencoes(request: Request, env: Env): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const url = new URL(request.url);
    const pagina = parseInt(url.searchParams.get("pagina") || "1");
    const limite = 50;
    const offset = (pagina - 1) * limite;

    const corretores = await listarCorretoresParaIsencao(env.DB, limite, offset);
    return respostaSucesso({ dados: corretores, pagina });
  } catch {
    return respostaErro("Erro ao listar isenções", 500);
  }
}

// POST /api/painel-admin/corretor/:id/isencao — concede ou edita a isenção
async function rotaConcederIsencao(request: Request, env: Env, corretorId: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "POST") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json() as { isento?: boolean; isento_ate?: string | null; motivo?: string };

    if (body.isento === undefined) return respostaErro("isento é obrigatório");
    if (!body.motivo?.trim()) return respostaErro("motivo é obrigatório ao conceder/editar isenção");

    const sucesso = await concederOuEditarIsencao(env.DB, corretorId, superadminId, {
      isento: body.isento,
      isento_ate: body.isento_ate || null,
      motivo: body.motivo.trim(),
    });

    if (!sucesso) return respostaErro("Erro ao conceder/editar isenção", 500);

    return respostaSucesso({ mensagem: "Isenção atualizada com sucesso" });
  } catch {
    return respostaErro("Erro ao processar isenção", 500);
  }
}

// DELETE /api/painel-admin/corretor/:id/isencao — revoga a isenção
async function rotaRevogarIsencao(request: Request, env: Env, corretorId: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  if (request.method !== "DELETE") return respostaErro("Método não permitido", 405);

  try {
    const body = await request.json().catch(() => ({})) as { motivo?: string };

    const sucesso = await revogarIsencao(env.DB, corretorId, superadminId, body.motivo?.trim());
    if (!sucesso) return respostaErro("Erro ao revogar isenção", 500);

    return respostaSucesso({ mensagem: "Isenção revogada com sucesso" });
  } catch {
    return respostaErro("Erro ao processar revogação", 500);
  }
}

// GET /api/painel-admin/corretor/:id/isencao/log — histórico de auditoria
async function rotaLogIsencao(request: Request, env: Env, corretorId: number): Promise<Response> {
  const superadminId = await obterSuperadminIdDaSessao(request, env);
  if (!superadminId) return respostaErro("Não autorizado", 401);

  try {
    const log = await listarLogIsencaoDoCorretor(env.DB, corretorId);
    return respostaSucesso({ dados: log });
  } catch {
    return respostaErro("Erro ao buscar log de isenção", 500);
  }
}

// ========== Roteador ==========

export async function rotasPainelSuperadminIsencao(request: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === "/isencoes" && request.method === "GET") {
    return rotaListarIsencoes(request, env);
  }

  const matchLog = pathname.match(/^\/corretor\/(\d+)\/isencao\/log$/);
  if (matchLog && request.method === "GET") {
    return rotaLogIsencao(request, env, parseInt(matchLog[1]));
  }

  const matchIsencao = pathname.match(/^\/corretor\/(\d+)\/isencao$/);
  if (matchIsencao && request.method === "POST") {
    return rotaConcederIsencao(request, env, parseInt(matchIsencao[1]));
  }
  if (matchIsencao && request.method === "DELETE") {
    return rotaRevogarIsencao(request, env, parseInt(matchIsencao[1]));
  }

  return new Response("Rota não encontrada", { status: 404 });
}
