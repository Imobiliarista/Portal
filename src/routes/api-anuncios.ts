// Roteador principal de endpoints de anúncios
// Delega para submódulos: api-anuncios-crud.ts, api-anuncios-listagem.ts e api-anuncios-backup.ts
// Conforme seção 6, 4.11 e 4.20 do project.md

import { Env } from "../index";
import { rotasAnunciosCrud } from "./api-anuncios-crud";
import { rotasAnunciosListagem } from "./api-anuncios-listagem";
import { rotasAnunciosBackup } from "./api-anuncios-backup";

// ========== Roteador principal ==========

export async function rotasAnuncios(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const caminho = url.pathname;
  const metodo = request.method;

  // Delega rotas de listagem — só GET; sem a checagem de método, um POST
  // (criar anúncio) caía aqui primeiro e nunca chegava no roteador de CRUD.
  if (caminho === "/api/anuncios" && metodo === "GET") {
    return rotasAnunciosListagem(request, env);
  }

  // Delega rotas de backup/restauração/exportação (Lote 17, seção 4.20)
  if (
    caminho === "/api/anuncios/backup" ||
    caminho === "/api/anuncios/restaurar" ||
    caminho.match(/^\/api\/anuncios\/exportar\/[a-z0-9-]+$/)
  ) {
    return rotasAnunciosBackup(request, env);
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
