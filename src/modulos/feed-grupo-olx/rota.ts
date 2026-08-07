// Rota: GET /feeds/grupo-olx/{slug-corretor}.xml — Serve o arquivo XML gerado
// Seção 4.11 do project.md

import { Env } from "../../index";

// Rota: GET /feeds/grupo-olx/{slug}.xml
export async function rotaFeedGrupoOLX(
  request: Request,
  url: URL,
  env: Env
): Promise<Response> {
  const slug = url.pathname.split("/").pop()?.replace(".xml", "");

  if (!slug) {
    return new Response("Slug de corretor não fornecido", { status: 400 });
  }

  try {
    // Busca o arquivo XML do R2
    const caminho = `feeds/grupo-olx/${slug}.xml`;
    const arquivo = await env.DADOS_CACHE.get(caminho);

    if (!arquivo) {
      return new Response("Feed não encontrado", { status: 404 });
    }

    // Retorna o XML com headers corretos
    return new Response(arquivo, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600", // Cache por 1 hora
      },
    });
  } catch (erro) {
    console.error(`Erro ao servir feed do Grupo OLX para "${slug}":`, erro);
    return new Response("Erro ao carregar feed", { status: 500 });
  }
}
