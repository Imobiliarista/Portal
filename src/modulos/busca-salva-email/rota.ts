// Endpoints para buscas salvas com alertas por e-mail (Lote 12.6)
// Seção 2.1 e 6 do project.md
// POST /api/busca-salva/salvar — salvar busca
// GET /api/busca-salva/cancelar/{token} — cancelar via LGPD (sem login)

import { Env } from "../../index";
import { estaModuloAtivo } from "../../db/queries-modulos";
import {
  criarBuscaSalva,
  cancelarBuscaSalva,
  obterBuscaPorToken,
} from "../../db/queries-buscas-salvas";

function gerarTokenCancelamento(): string {
  // Token de 32 caracteres aleatórios para cancelamento
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function validarEmail(email: string): boolean {
  const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regexEmail.test(email);
}

export async function rotaBuscaSalva(
  request: Request,
  url: URL,
  env: Env
): Promise<Response> {
  // Verifica se o módulo está ativo
  const moduloAtivo = await estaModuloAtivo(env.DB, "busca-salva-email");
  if (!moduloAtivo) {
    return new Response(
      JSON.stringify({
        erro: "Módulo de busca salva não está ativo",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Endpoint: POST /api/busca-salva/salvar
  if (request.method === "POST" && url.pathname === "/api/busca-salva/salvar") {
    return tratarSalvarBusca(request, env);
  }

  // Endpoint: GET /api/busca-salva/cancelar/{token}
  if (
    request.method === "GET" &&
    url.pathname.match(/^\/api\/busca-salva\/cancelar\/[a-z0-9]{32}$/)
  ) {
    return tratarCancelarBusca(url, env);
  }

  return new Response("Rota não encontrada", { status: 404 });
}

async function tratarSalvarBusca(request: Request, env: Env): Promise<Response> {
  try {
    const corpo = await request.json() as { email: string; criterios: Record<string, unknown> };

    // Validações
    const { email, criterios } = corpo;

    if (!email || !validarEmail(email)) {
      return new Response(
        JSON.stringify({
          erro: "E-mail inválido",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!criterios || typeof criterios !== "object") {
      return new Response(
        JSON.stringify({
          erro: "Critérios inválidos",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Cria a busca salva
    const token = gerarTokenCancelamento();
    const buscaSalva = await criarBuscaSalva(env.DB, email, criterios, token);

    if (!buscaSalva) {
      return new Response(
        JSON.stringify({
          erro: "Erro ao salvar busca",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Retorna sucesso com o link de cancelamento
    return new Response(
      JSON.stringify({
        sucesso: true,
        mensagem: "Busca salva com sucesso! Você receberá notificações por e-mail.",
        id: buscaSalva.id,
        tokenCancelamento: token, // Para uso no front-end se necessário
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (erro) {
    console.error("Erro ao salvar busca:", erro);
    return new Response(
      JSON.stringify({
        erro: "Erro interno ao processar requisição",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

async function tratarCancelarBusca(url: URL, env: Env): Promise<Response> {
  try {
    // Extrai o token da URL
    const match = url.pathname.match(/\/api\/busca-salva\/cancelar\/([a-z0-9]{32})/);
    if (!match) {
      return new Response("Token inválido", { status: 400 });
    }

    const token = match[1];

    // Verifica se a busca existe
    const busca = await obterBuscaPorToken(env.DB, token);
    if (!busca) {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Busca Salva Cancelada</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center; }
              .erro { color: #d32f2f; }
              .sucesso { color: #388e3c; }
            </style>
          </head>
          <body>
            <h1>Busca Salva Cancelada</h1>
            <p class="erro">Esta busca não foi encontrada ou já foi cancelada.</p>
            <p><a href="https://imobiliarista.net">Voltar ao portal</a></p>
          </body>
        </html>
        `,
        {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }

    // Cancela a busca (LGPD: revogação de consentimento)
    const sucesso = await cancelarBuscaSalva(env.DB, token);

    if (!sucesso) {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Erro ao Cancelar</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center; }
              .erro { color: #d32f2f; }
            </style>
          </head>
          <body>
            <h1>Erro ao Cancelar</h1>
            <p class="erro">Ocorreu um erro ao processar seu cancelamento. Tente novamente mais tarde.</p>
            <p><a href="https://imobiliarista.net">Voltar ao portal</a></p>
          </body>
        </html>
        `,
        {
          status: 500,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }

    // Sucesso
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Busca Salva Cancelada</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center; }
            .sucesso { color: #388e3c; }
          </style>
        </head>
        <body>
          <h1>Cancelamento Confirmado</h1>
          <p class="sucesso">Sua busca foi cancelada com sucesso.</p>
          <p>Você não receberá mais notificações para este critério.</p>
          <p><a href="https://imobiliarista.net">Voltar ao portal</a></p>
        </body>
      </html>
      `,
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  } catch (erro) {
    console.error("Erro ao cancelar busca:", erro);
    return new Response("Erro interno", { status: 500 });
  }
}
