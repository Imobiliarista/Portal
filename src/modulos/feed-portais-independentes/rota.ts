// Rota: GET /feeds/{portal-slug}/{slug-corretor}.{ext} — Serve arquivos de portais independentes
// Seção 4.11 do project.md

import { Env } from "../../index";

// Rota: GET /feeds/{portal}/{slug}.{ext}
export async function rotaFeedPortalIndependente(
  request: Request,
  url: URL,
  env: Env
): Promise<Response> {
  // Extrai portal e slug da URL: /feeds/imovelweb/marcos.xml
  const pathname = url.pathname;
  const parts = pathname.split("/").filter(Boolean); // Remove strings vazias

  if (parts.length < 3) {
    return new Response("Caminho inválido", { status: 400 });
  }

  // parts[0] = 'feeds', parts[1] = portal_slug, parts[2] = arquivo.ext
  const portalSlug = parts[1];
  const arquivo = parts[2];

  if (!portalSlug || !arquivo) {
    return new Response("Portal ou arquivo não fornecido", { status: 400 });
  }

  try {
    // Busca o arquivo no R2
    const caminho = `feeds/${portalSlug}/${arquivo}`;
    const objeto = await env.DADOS_CACHE.get(caminho);

    if (!objeto) {
      return new Response("Feed não encontrado", { status: 404 });
    }

    // Detecta tipo de conteúdo pela extensão
    let contentType = "application/octet-stream";
    if (arquivo.endsWith(".xml")) {
      contentType = "application/xml; charset=utf-8";
    } else if (arquivo.endsWith(".csv")) {
      contentType = "text/csv; charset=utf-8";
    } else if (arquivo.endsWith(".json")) {
      contentType = "application/json; charset=utf-8";
    }

    // Retorna o arquivo com headers corretos
    return new Response(objeto.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600", // Cache por 1 hora
      },
    });
  } catch (erro) {
    console.error(
      `Erro ao servir feed de ${portalSlug} para "${arquivo}":`,
      erro
    );
    return new Response("Erro ao carregar feed", { status: 500 });
  }
}
