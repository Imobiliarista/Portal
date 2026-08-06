// Middleware de detecção de robôs de busca e previsualizadores (Lote 11)
// Identifica Googlebot, Bingbot, WhatsApp, Facebook, LinkedIn, etc. via User-Agent
// Dynamic rendering: serve HTML pré-renderizado para bots (seção 4.6)
// HTTP 410 Gone para anúncios vendido/removido (seção 4.17)

import { Env } from "../index";
import { lerJSON } from "../lib/r2";

interface AnuncioDetalhe {
  id: number;
  titulo: string;
  preco_venda?: number;
  preco_aluguel?: number;
  descricao?: string;
  fotos_json?: string;
  quartos?: number;
  banheiros?: number;
  area_util?: number;
  corretor_id: number;
}

const BOTS_USER_AGENTS = [
  /googlebot/i,
  /google-structured-data-testing-tool/i,
  /google-site-verification/i,
  /bingbot/i,
  /msnbot/i,
  /facebookexternalhit/i,
  /facebook/i,
  /whatsapp/i,
  /linkedinbot/i,
  /twitterbot/i,
  /telegrambot/i,
  /baidu/i,
  /yandex/i,
  /duckduckbot/i,
  /baiduspider/i,
  /curl/i,
  /wget/i,
  /slurp/i,
  /pinterest/i,
  /inoreader/i,
  /feedly/i,
  /crawler/i,
  /spider/i,
  /bot/i,
];

export function ehBot(request: Request): boolean {
  const userAgent = request.headers.get("user-agent") || "";

  if (!userAgent) {
    return false;
  }

  return BOTS_USER_AGENTS.some((pattern) => pattern.test(userAgent));
}

export async function renderizarParaBot(
  anuncioId: number,
  env: Env,
): Promise<Response | null> {
  try {
    const anuncio = await env.DB.prepare(
      `SELECT a.id, a.titulo, a.preco_venda, a.preco_aluguel, a.descricao,
              a.fotos_json, a.quartos, a.banheiros, a.area_util, a.vendido_removido,
              a.corretor_id
       FROM anuncios a
       WHERE a.id = ?`,
    )
      .bind(anuncioId)
      .first();

    if (!anuncio) {
      return new Response("Not Found", { status: 404 });
    }

    const anuncioDados = anuncio as AnuncioDetalhe;

    // HTTP 410 Gone para anúncios vendido/removido
    if (anuncioDados.vendido_removido) {
      return new Response(
        `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escaparHtml(anuncioDados.titulo)} - Indisponível</title>
  <meta name="robots" content="noindex, follow">
</head>
<body>
  <h1>Este imóvel não está mais disponível</h1>
  <p>O anúncio "${escaparHtml(anuncioDados.titulo)}" foi removido ou já foi vendido.</p>
</body>
</html>`,
        {
          status: 410,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      );
    }

    // Anúncio ativo: renderizar HTML com metadados
    const preco =
      anuncioDados.preco_venda || anuncioDados.preco_aluguel || "Consultar";
    const precoFormatado =
      typeof preco === "number"
        ? new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
          }).format(preco)
        : preco;

    let fotos: string[] = [];
    if (anuncioDados.fotos_json) {
      try {
        fotos = JSON.parse(anuncioDados.fotos_json);
      } catch {
        fotos = [];
      }
    }

    const fotoCapa = fotos.length > 0 ? fotos[0] : "";
    const descricao = escaparHtml(
      anuncioDados.descricao || "Imóvel à venda/aluguel",
    );
    const titulo = escaparHtml(anuncioDados.titulo);

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo} - Imobiliarista</title>
  <meta name="description" content="${descricao}">
  <meta property="og:title" content="${titulo}">
  <meta property="og:description" content="${descricao}">
  <meta property="og:type" content="website">
  ${fotoCapa ? `<meta property="og:image" content="${fotoCapa}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${titulo}">
  <meta name="twitter:description" content="${descricao}">
  ${fotoCapa ? `<meta name="twitter:image" content="${fotoCapa}">` : ""}
</head>
<body>
  <h1>${titulo}</h1>
  ${fotoCapa ? `<img src="${fotoCapa}" alt="${titulo}">` : ""}
  <p><strong>Preço:</strong> ${precoFormatado}</p>
  ${anuncioDados.quartos ? `<p><strong>Quartos:</strong> ${anuncioDados.quartos}</p>` : ""}
  ${anuncioDados.banheiros ? `<p><strong>Banheiros:</strong> ${anuncioDados.banheiros}</p>` : ""}
  ${anuncioDados.area_util ? `<p><strong>Área:</strong> ${anuncioDados.area_util} m²</p>` : ""}
  <p>${descricao}</p>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch (erro) {
    console.error(`Erro ao renderizar para bot:`, erro);
    return null;
  }
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
