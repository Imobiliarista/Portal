// Rota: POST /api/busca-ia — assistente de busca em linguagem natural
// Seção 4.12 do project.md
// Só funciona no domínio raiz (imobiliarista.net), não em minisites

import { Env } from "../../index";
import { buscarComIA } from "./logica";
import { estaModuloAtivo } from "../../db/queries-modulos";

export async function rotaBuscaIA(request: Request, url: URL, env: Env): Promise<Response> {
  // Só POST
  if (request.method !== "POST") {
    return new Response("Método não permitido", { status: 405 });
  }

  // Valida se está no domínio raiz (não em minisite)
  if (url.hostname !== "imobiliarista.net") {
    return new Response(
      JSON.stringify({
        erro: "Busca por IA está disponível apenas no portal principal",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Verifica se o módulo está ativo
  const moduloAtivo = await estaModuloAtivo(env.DB, "busca-ia");
  if (!moduloAtivo) {
    return new Response(
      JSON.stringify({
        erro: "Módulo de busca por IA não está ativo",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Parse do corpo da requisição
    let corpo: any;
    try {
      corpo = await request.json();
    } catch {
      return new Response(
        JSON.stringify({
          erro: "Body inválido: esperado JSON",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const frase = corpo.frase || corpo.query || "";

    // Valida a frase
    if (!frase || typeof frase !== "string" || frase.trim().length < 3) {
      return new Response(
        JSON.stringify({
          erro: "Frase deve ter pelo menos 3 caracteres",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Chama a busca com IA
    const filtros = await buscarComIA(frase.trim(), env.AI);

    if (!filtros) {
      return new Response(
        JSON.stringify({
          erro: "Não foi possível interpretar sua busca. Tente ser mais específico.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Retorna os filtros estruturados
    return new Response(JSON.stringify(filtros), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache", // Não cachear respostas de IA
      },
    });
  } catch (erro) {
    console.error("Erro na rota de busca por IA:", erro);
    return new Response(
      JSON.stringify({
        erro: "Erro interno ao processar busca",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
