// Rotas do módulo Publicações (Lote 16, seção 4.19): /publicacoes
// (listagem) e /publicacoes/{id-do-post} (post individual, path routing).
// Chamada por routes/minisite.ts quando o pathname bate com o padrão —
// nunca disponível no Portal Principal (dupla checagem: flag de rede +
// permite_publicacoes do plano + opt-in do corretor).
//
// Entrega ao visitante é 100% client-side (ver logica.ts e
// public/assets/js/publicacoes.js): esta rota só decide se o módulo está
// disponível e devolve a casca HTML com o contexto necessário (URL do
// feed já resolvida) — o fetch() no Blogspot em si acontece no navegador,
// nunca aqui. A única leitura de feed feita pelo Worker é para o post
// individual, só para preencher meta tags de SEO (title/description/OG),
// que servem tanto humano quanto bot sem precisar de sniff de User-Agent.

import { Env } from "../../index";
import {
  buscarPostPorId,
  obterFeedPadraoRedeUrl,
  resolverUrlFeed,
  verificarElegibilidadePublicacoes,
} from "./logica";

const REGEX_POST = /^\/publicacoes\/([a-zA-Z0-9_-]+)\/?$/;

export function ehRotaPublicacoes(pathname: string): boolean {
  return pathname === "/publicacoes" || pathname === "/publicacoes/" || REGEX_POST.test(pathname);
}

export async function rotaPublicacoes(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Método não permitido", { status: 405 });
  }

  const elegibilidade = await verificarElegibilidadePublicacoes(env.DB, url.hostname);

  // Módulo desligado (rede, plano ou opt-in do corretor) → rota deixa de
  // ser servida (4.19, "Desativação/downgrade").
  if (!elegibilidade.elegivel) {
    return new Response("Not Found", { status: 404 });
  }

  const feedUrl = resolverUrlFeed(elegibilidade.config, obterFeedPadraoRedeUrl(env));
  const matchPost = url.pathname.match(REGEX_POST);

  if (matchPost) {
    return paginaPost(feedUrl, matchPost[1], elegibilidade.nomeExibicao || elegibilidade.slug || "");
  }

  return paginaListagem(feedUrl, elegibilidade.nomeExibicao || elegibilidade.slug || "");
}

// ============================================================
// Casca HTML — o conteúdo real é montado por publicacoes.js a partir do
// contexto embutido em window.__PUBLICACOES_CONTEXT__
// ============================================================

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function respostaHtml(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function moldura(opts: {
  titulo: string;
  descricao: string;
  ogImagem?: string;
  conteudoFallback: string;
  contexto: Record<string, unknown>;
}): string {
  const { titulo, descricao, ogImagem, conteudoFallback, contexto } = opts;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escaparHtml(titulo)}</title>
  <meta name="description" content="${escaparHtml(descricao)}" />
  <meta property="og:title" content="${escaparHtml(titulo)}" />
  <meta property="og:description" content="${escaparHtml(descricao)}" />
  <meta property="og:type" content="article" />
  ${ogImagem ? `<meta property="og:image" content="${escaparHtml(ogImagem)}" />` : ""}
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" type="image/x-icon" href="/icons/favicon.png" />
  <link href="https://cdn.tailwindcss.com" rel="stylesheet" />
</head>
<body class="bg-gray-50 text-gray-900 min-h-screen flex flex-col">
  <header class="bg-white shadow-sm sticky top-0 z-40">
    <nav class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <a href="/" class="text-xl font-bold text-slate-900 hover:text-slate-700">← Voltar ao site</a>
    </nav>
  </header>

  <main class="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
    <div id="publicacoes-root">${conteudoFallback}</div>
  </main>

  <footer class="text-center text-sm text-gray-500 py-6 border-t bg-white">
    Publicações
  </footer>

  <script>window.__PUBLICACOES_CONTEXT__ = ${JSON.stringify(contexto)};</script>
  <script src="/assets/js/publicacoes.js"></script>
</body>
</html>`;
}

function paginaListagem(feedUrl: string, nomeExibicao: string): Response {
  const titulo = nomeExibicao ? `Publicações — ${nomeExibicao}` : "Publicações";

  return respostaHtml(
    moldura({
      titulo,
      descricao: `Últimas publicações de ${nomeExibicao || "nosso blog"}.`,
      conteudoFallback: '<p class="text-gray-600">Carregando publicações…</p>',
      contexto: { modo: "listagem", feedUrl },
    }),
  );
}

async function paginaPost(feedUrl: string, postId: string, nomeExibicao: string): Promise<Response> {
  const post = await buscarPostPorId(feedUrl, postId);

  if (!post) {
    return respostaHtml(
      moldura({
        titulo: "Publicação não encontrada",
        descricao: "Esta publicação não está mais disponível.",
        conteudoFallback: '<p class="text-gray-600">Publicação não encontrada.</p>',
        contexto: { modo: "detalhe", feedUrl, postId },
      }),
    );
  }

  const resumoTextoSimples = post.resumo.replace(/<[^>]+>/g, "").slice(0, 200);

  return respostaHtml(
    moldura({
      titulo: `${post.titulo} — ${nomeExibicao}`,
      descricao: resumoTextoSimples,
      conteudoFallback: `<article><h1 class="text-2xl font-bold mb-2">${escaparHtml(post.titulo)}</h1><p class="text-gray-600">${escaparHtml(resumoTextoSimples)}</p></article>`,
      contexto: { modo: "detalhe", feedUrl, postId },
    }),
  );
}
