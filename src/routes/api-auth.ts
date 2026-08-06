// Roteador fino: autenticação (pré-cadastro, login, recuperação de senha)
// Delega para submódulos especializados (api-auth-*, conforme padrão em api-anuncios.ts)
// POST/GET /api/auth/*

import { Env } from "../index";
import { handlePreCadastro } from "./api-auth-cadastro";
import { handleLogin, handleLogout, handleVerificacaoSessao } from "./api-auth-login";
import { handleRecuperacaoSenha, handleRedefinirSenha } from "./api-auth-recuperacao";

export async function rotasAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const metodo = request.method;
  const caminho = url.pathname;

  if (metodo === "POST" && caminho === "/api/auth/pre-cadastro") {
    return handlePreCadastro(request, env);
  }

  if (metodo === "POST" && caminho === "/api/auth/login") {
    return handleLogin(request, env);
  }

  if (metodo === "POST" && caminho === "/api/auth/logout") {
    return handleLogout(request, env);
  }

  if (metodo === "POST" && caminho === "/api/auth/recuperacao-senha") {
    return handleRecuperacaoSenha(request, env);
  }

  if (metodo === "POST" && caminho === "/api/auth/redefinir-senha") {
    return handleRedefinirSenha(request, env);
  }

  if (metodo === "GET" && caminho === "/api/auth/sessao") {
    return handleVerificacaoSessao(request, env);
  }

  return new Response(JSON.stringify({ erro: "Rota não encontrada" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
