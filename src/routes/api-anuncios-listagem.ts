// Endpoints de listagem de anúncios
// GET /api/anuncios/*
// Conforme seção 6 e 4.11 do project.md

import { Env } from "../index";
import { listarAnunciosDoCorretor } from "../db/queries-anuncios";
import { obterCorretorAutenticado } from "../lib/sessao";

// GET /api/anuncios?pagina=1&limite=10
// Lista anúncios do corretor logado
async function handleListarAnuncios(request: Request, env: Env): Promise<Response> {
  try {
    const corretorId = await obterCorretorAutenticado(request, env);
    if (!corretorId) {
      return new Response(JSON.stringify({ erro: "Não autenticado" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const pagina = Math.max(1, parseInt(url.searchParams.get("pagina") || "1"));
    const limite = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limite") || "10")));

    const { anuncios, total } = await listarAnunciosDoCorretor(env.DB, corretorId, pagina, limite);

    return new Response(JSON.stringify({
      sucesso: true,
      anuncios,
      paginacao: {
        pagina,
        limite,
        total,
        paginas_totais: Math.ceil(total / limite),
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (erro) {
    console.error("Erro ao listar anúncios:", erro);
    return new Response(JSON.stringify({ erro: "Erro ao listar anúncios" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// ========== Roteador para rotas de listagem ==========

export async function rotasAnunciosListagem(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const metodo = request.method;
  const caminho = url.pathname;

  if (metodo === "GET" && caminho === "/api/anuncios") {
    return handleListarAnuncios(request, env);
  }

  return new Response(JSON.stringify({ erro: "Rota não encontrada" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
