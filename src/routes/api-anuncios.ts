// Roteador principal de endpoints de anúncios
// Delega para submódulos: api-anuncios-crud.ts e api-anuncios-listagem.ts
// Conforme seção 6 e 4.11 do project.md

import { Env } from "../index";
import { rotasAnunciosCrud } from "./api-anuncios-crud";
import { rotasAnunciosListagem } from "./api-anuncios-listagem";

// ========== Roteador principal ==========

export async function rotasAnuncios(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const caminho = url.pathname;

  // Delega rotas de listagem
  if (caminho === "/api/anuncios") {
    return rotasAnunciosListagem(request, env);
  }

  // Delega rotas de CRUD (criar, obter, editar, deletar)
  if (caminho === "/api/anuncios" || caminho.match(/^\/api\/anuncios\/\d+$/)) {
    return rotasAnunciosCrud(request, env);
  }

  return new Response(JSON.stringify({ erro: "Rota não encontrada" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
