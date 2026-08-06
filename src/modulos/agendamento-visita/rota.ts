// Endpoints para agendamento de visita (Lote 12.7)
// POST /api/agendamento/solicitar — visitante solicita visita (público)
// GET /api/agendamento/listar — corretor lista agendamentos (autenticado)
// POST /api/agendamento/{id}/confirmar — corretor confirma (autenticado)
// POST /api/agendamento/{id}/recusar — corretor recusa (autenticado)

import { Env } from "../../index";
import { estaModuloAtivo } from "../../db/queries-modulos";
import {
  criarAgendamento,
  obterAgendamentosPorCorretor,
  obterAgendamentoPorId,
  confirmarAgendamento,
  recusarAgendamento,
} from "../../db/queries-agendamentos";
import {
  enviarEmailNotificacaoAoCorretor,
  enviarEmailConfirmacaoVisitante,
  enviarEmailRecusaVisitante,
} from "./logica";

function validarEmail(email: string): boolean {
  const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regexEmail.test(email);
}

function validarTelefone(telefone: string): boolean {
  // Aceita apenas números, hífen e espaço
  return /^[\d\s\-\(\)]+$/.test(telefone) && telefone.replace(/\D/g, "").length >= 10;
}

export async function rotaAgendamentoVisita(
  request: Request,
  url: URL,
  env: Env,
  sessaoCorretorId?: number
): Promise<Response> {
  // Verifica se o módulo está ativo
  const moduloAtivo = await estaModuloAtivo(env.DB, "agendamento-visita");
  if (!moduloAtivo) {
    return new Response(
      JSON.stringify({ erro: "Módulo de agendamento não está ativo" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // POST /api/agendamento/solicitar (público)
  if (request.method === "POST" && url.pathname === "/api/agendamento/solicitar") {
    return tratarSolicitar(request, env);
  }

  // GET /api/agendamento/listar (autenticado)
  if (
    request.method === "GET" &&
    url.pathname === "/api/agendamento/listar" &&
    sessaoCorretorId
  ) {
    return tratarListar(env, sessaoCorretorId);
  }

  // POST /api/agendamento/{id}/confirmar (autenticado)
  if (
    request.method === "POST" &&
    url.pathname.match(/^\/api\/agendamento\/\d+\/confirmar$/) &&
    sessaoCorretorId
  ) {
    const match = url.pathname.match(/\/api\/agendamento\/(\d+)\/confirmar/);
    if (match) {
      return tratarConfirmar(env, parseInt(match[1]), sessaoCorretorId);
    }
  }

  // POST /api/agendamento/{id}/recusar (autenticado)
  if (
    request.method === "POST" &&
    url.pathname.match(/^\/api\/agendamento\/\d+\/recusar$/) &&
    sessaoCorretorId
  ) {
    const match = url.pathname.match(/\/api\/agendamento\/(\d+)\/recusar/);
    if (match) {
      return tratarRecusar(request, env, parseInt(match[1]), sessaoCorretorId);
    }
  }

  return new Response("Rota não encontrada", { status: 404 });
}

async function tratarSolicitar(request: Request, env: Env): Promise<Response> {
  try {
    const corpo = await request.json();
    const { anuncio_id, nome_visitante, telefone_visitante, email_visitante, data_horario_sugerido } =
      corpo;

    // Validações
    if (!anuncio_id || !Number.isInteger(anuncio_id)) {
      return new Response(
        JSON.stringify({ erro: "ID do anúncio inválido" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!nome_visitante || nome_visitante.trim().length < 3) {
      return new Response(
        JSON.stringify({ erro: "Nome do visitante deve ter pelo menos 3 caracteres" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!validarTelefone(telefone_visitante)) {
      return new Response(
        JSON.stringify({ erro: "Telefone inválido" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!validarEmail(email_visitante)) {
      return new Response(
        JSON.stringify({ erro: "E-mail inválido" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!data_horario_sugerido) {
      return new Response(
        JSON.stringify({ erro: "Data e hora são obrigatórias" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Busca o anúncio para obter corretor_id
    const anuncio = await env.DB.prepare(
      "SELECT id, corretor_id, titulo, endereco_completo FROM anuncios WHERE id = ? LIMIT 1"
    )
      .bind(anuncio_id)
      .first();

    if (!anuncio) {
      return new Response(
        JSON.stringify({ erro: "Anúncio não encontrado" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Cria o agendamento
    const agendamento = await criarAgendamento(
      env.DB,
      anuncio_id,
      anuncio.corretor_id,
      nome_visitante.trim(),
      telefone_visitante.trim(),
      email_visitante.trim(),
      data_horario_sugerido
    );

    if (!agendamento) {
      return new Response(
        JSON.stringify({ erro: "Erro ao criar agendamento" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Busca dados do corretor
    const corretor = await env.DB.prepare(
      "SELECT nome_completo, email FROM corretores WHERE id = ? LIMIT 1"
    )
      .bind(anuncio.corretor_id)
      .first();

    if (corretor) {
      // Envia e-mail ao corretor
      await enviarEmailNotificacaoAoCorretor(
        agendamento,
        anuncio.titulo,
        anuncio.endereco_completo || "Endereço não informado",
        corretor.nome_completo
      );
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        mensagem: "Solicitação de visita enviada com sucesso!",
        agendamento_id: agendamento.id,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (erro) {
    console.error("Erro ao solicitar agendamento:", erro);
    return new Response(
      JSON.stringify({ erro: "Erro interno ao processar requisição" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function tratarListar(
  env: Env,
  sessaoCorretorId: number
): Promise<Response> {
  try {
    const agendamentos = await obterAgendamentosPorCorretor(env.DB, sessaoCorretorId);

    return new Response(
      JSON.stringify({
        sucesso: true,
        agendamentos,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (erro) {
    console.error("Erro ao listar agendamentos:", erro);
    return new Response(
      JSON.stringify({ erro: "Erro interno ao processar requisição" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function tratarConfirmar(
  env: Env,
  agendamentoId: number,
  sessaoCorretorId: number
): Promise<Response> {
  try {
    const agendamento = await obterAgendamentoPorId(env.DB, agendamentoId);

    if (!agendamento) {
      return new Response(
        JSON.stringify({ erro: "Agendamento não encontrado" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (agendamento.corretor_id !== sessaoCorretorId) {
      return new Response(
        JSON.stringify({ erro: "Acesso negado" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const atualizado = await confirmarAgendamento(env.DB, agendamentoId);

    if (!atualizado) {
      return new Response(
        JSON.stringify({ erro: "Erro ao confirmar agendamento" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Busca dados para enviar e-mail
    const anuncio = await env.DB.prepare(
      "SELECT titulo FROM anuncios WHERE id = ? LIMIT 1"
    )
      .bind(agendamento.anuncio_id)
      .first();

    const corretor = await env.DB.prepare(
      "SELECT nome_completo FROM corretores WHERE id = ? LIMIT 1"
    )
      .bind(sessaoCorretorId)
      .first();

    if (anuncio && corretor) {
      await enviarEmailConfirmacaoVisitante(
        atualizado,
        anuncio.titulo,
        corretor.nome_completo
      );
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        mensagem: "Agendamento confirmado!",
        agendamento: atualizado,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (erro) {
    console.error("Erro ao confirmar agendamento:", erro);
    return new Response(
      JSON.stringify({ erro: "Erro interno ao processar requisição" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function tratarRecusar(
  request: Request,
  env: Env,
  agendamentoId: number,
  sessaoCorretorId: number
): Promise<Response> {
  try {
    const corpo = await request.json();
    const { motivo_recusa } = corpo;

    const agendamento = await obterAgendamentoPorId(env.DB, agendamentoId);

    if (!agendamento) {
      return new Response(
        JSON.stringify({ erro: "Agendamento não encontrado" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (agendamento.corretor_id !== sessaoCorretorId) {
      return new Response(
        JSON.stringify({ erro: "Acesso negado" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const atualizado = await recusarAgendamento(env.DB, agendamentoId, motivo_recusa);

    if (!atualizado) {
      return new Response(
        JSON.stringify({ erro: "Erro ao recusar agendamento" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Busca dados para enviar e-mail
    const anuncio = await env.DB.prepare(
      "SELECT titulo FROM anuncios WHERE id = ? LIMIT 1"
    )
      .bind(agendamento.anuncio_id)
      .first();

    const corretor = await env.DB.prepare(
      "SELECT nome_completo FROM corretores WHERE id = ? LIMIT 1"
    )
      .bind(sessaoCorretorId)
      .first();

    if (anuncio && corretor) {
      await enviarEmailRecusaVisitante(atualizado, anuncio.titulo, corretor.nome_completo);
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        mensagem: "Agendamento recusado",
        agendamento: atualizado,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (erro) {
    console.error("Erro ao recusar agendamento:", erro);
    return new Response(
      JSON.stringify({ erro: "Erro interno ao processar requisição" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
