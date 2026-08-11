// Rotas do módulo PWA (Lote 15, seção 4.18): /apps, /apps/android,
// /apps/iphone — replicadas no Portal Principal e, quando elegível, em
// cada minisite — além de servir /manifest.json e /sw.js dinamicamente
// (dupla checagem: flag de rede + `permite_pwa` do plano do corretor).
//
// Sem banner automático: o beforeinstallprompt é suprimido globalmente
// em todas as páginas (assets/js/pwa-instalador.js) — aqui só oferecemos
// o prompt sob ação explícita do visitante.

import { Env } from "../../index";
import { estaModuloAtivo } from "../../db/queries-modulos";
import {
  ehDominioRaiz,
  extrairSlugMinisite,
  verificarElegibilidadePwa,
} from "./logica";
import { gerarManifestPortal } from "./gerador-manifest";
import { gerarServiceWorkerAtivo, gerarServiceWorkerSuicida } from "./gerador-service-worker";

// Bump manual quando a casca institucional do Portal mudar de forma que
// exija invalidar o cache local (ver 4.6.1). O SW dos minisites é
// versionado automaticamente a cada regeneração do lote (logica.ts).
const VERSAO_SW_PORTAL = "2026-08-11";

export async function rotaPwa(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Método não permitido", { status: 405 });
  }

  switch (url.pathname) {
    case "/manifest.json":
      return responderManifest(url, env);
    case "/sw.js":
      return responderServiceWorker(url, env);
    case "/apps":
      return paginaEscolha(url, env);
    case "/apps/android":
      return paginaAndroid(url, env);
    case "/apps/iphone":
      return paginaIphone(url, env);
    default:
      return new Response("Not Found", { status: 404 });
  }
}

// ============================================================
// Manifest e Service Worker
// ============================================================

async function responderManifest(url: URL, env: Env): Promise<Response> {
  const hostname = url.hostname;

  if (ehDominioRaiz(hostname)) {
    const ativo = await estaModuloAtivo(env.DB, "pwa");
    if (!ativo) return new Response("Not Found", { status: 404 });

    return new Response(JSON.stringify(gerarManifestPortal()), {
      status: 200,
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    });
  }

  const slug = extrairSlugMinisite(hostname);
  if (!slug) return new Response("Not Found", { status: 404 });

  const objeto = await env.DADOS_CACHE.get(`pwa/${slug}/manifest.json`);
  if (!objeto) return new Response("Not Found", { status: 404 });

  return new Response(await objeto.text(), {
    status: 200,
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

async function responderServiceWorker(url: URL, env: Env): Promise<Response> {
  const hostname = url.hostname;

  if (ehDominioRaiz(hostname)) {
    const ativo = await estaModuloAtivo(env.DB, "pwa");
    const corpo = ativo ? gerarServiceWorkerAtivo(VERSAO_SW_PORTAL) : gerarServiceWorkerSuicida();

    return new Response(corpo, {
      status: 200,
      headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache" },
    });
  }

  const slug = extrairSlugMinisite(hostname);
  if (!slug) return new Response("Not Found", { status: 404 });

  const objeto = await env.DADOS_CACHE.get(`pwa/${slug}/service-worker.js`);
  if (!objeto) return new Response("Not Found", { status: 404 });

  return new Response(await objeto.text(), {
    status: 200,
    headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache" },
  });
}

// ============================================================
// Páginas /apps/*
// ============================================================

function respostaHtml(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// Escapa nome do corretor (dado do visitante/corretor, não confiável)
// antes de interpolar nas páginas HTML geradas abaixo.
function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cabecalhoPagina(titulo: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,follow" />
  <title>${escaparHtml(titulo)}</title>
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" type="image/x-icon" href="/icons/favicon.png" />
  <link href="https://cdn.tailwindcss.com" rel="stylesheet" />
</head>
<body class="bg-gray-50 text-gray-900 min-h-screen flex flex-col">
  <script src="/assets/js/pwa-instalador.js"></script>
  <main class="flex-1 flex items-center justify-center px-4 py-12">
    <div class="max-w-md w-full bg-white rounded-lg card-shadow shadow-lg p-8 text-center">`;
}

const RODAPE_PAGINA = `
    </div>
  </main>
  <footer class="text-center text-sm text-gray-500 py-6">
    <a href="/" class="hover:text-gray-700">← Voltar ao início</a>
  </footer>
</body>
</html>`;

async function paginaEscolha(url: URL, env: Env): Promise<Response> {
  const elegibilidade = await verificarElegibilidadePwa(env.DB, url.hostname);

  if (!elegibilidade.elegivel) {
    return respostaHtml(`${cabecalhoPagina("App não disponível")}
      <h1 class="text-2xl font-bold mb-4">📵 App não disponível</h1>
      <p class="text-gray-600">Este site não tem um aplicativo instalável no momento.</p>
      ${RODAPE_PAGINA}`);
  }

  return respostaHtml(`${cabecalhoPagina(`Instalar App — ${elegibilidade.nomeExibicao}`)}
      <h1 class="text-2xl font-bold mb-2">📲 Instale o app</h1>
      <p class="text-gray-600 mb-6">${escaparHtml(elegibilidade.nomeExibicao)} direto na tela do seu celular, sem precisar abrir o navegador.</p>
      <div id="ja-instalado" class="hidden bg-green-50 text-green-800 rounded-lg p-4 mb-4 font-medium">✅ Você já tem o app instalado!</div>
      <div id="opcoes" class="space-y-3">
        <a href="/apps/android" class="block w-full px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition">🤖 Tenho Android</a>
        <a href="/apps/iphone" class="block w-full px-4 py-3 border-2 border-slate-900 text-slate-900 hover:bg-slate-50 rounded-lg font-semibold transition">🍎 Tenho iPhone</a>
      </div>
      <script>
        if (window.PwaInstalador && window.PwaInstalador.jaInstalado()) {
          document.getElementById('ja-instalado').classList.remove('hidden');
          document.getElementById('opcoes').classList.add('hidden');
        }
      </script>
      ${RODAPE_PAGINA}`);
}

async function paginaAndroid(url: URL, env: Env): Promise<Response> {
  const elegibilidade = await verificarElegibilidadePwa(env.DB, url.hostname);

  if (!elegibilidade.elegivel) {
    return respostaHtml(`${cabecalhoPagina("App não disponível")}
      <h1 class="text-2xl font-bold mb-4">📵 App não disponível</h1>
      <p class="text-gray-600">Este site não tem um aplicativo instalável no momento.</p>
      ${RODAPE_PAGINA}`);
  }

  return respostaHtml(`${cabecalhoPagina("Instalar no Android")}
      <h1 class="text-2xl font-bold mb-6">🤖 Instalar no Android</h1>

      <div id="estado-ja-instalado" class="hidden bg-green-50 text-green-800 rounded-lg p-4 font-medium">✅ App já instalado neste dispositivo.</div>
      <div id="estado-aguardando" class="text-gray-600">⏳ Preparando instalação…</div>
      <div id="estado-pronto" class="hidden">
        <p class="text-gray-600 mb-4">Toque no botão abaixo para instalar.</p>
        <button id="btn-instalar" class="w-full px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition">📲 Instalar agora</button>
      </div>
      <div id="estado-nao-suportado" class="hidden bg-amber-50 text-amber-800 rounded-lg p-4 text-sm">
        Seu navegador não ofereceu a instalação automática. Abra este site no Chrome ou Edge mais recente e tente novamente.
      </div>

      <script>
        (function () {
          const elJaInstalado = document.getElementById('estado-ja-instalado');
          const elAguardando = document.getElementById('estado-aguardando');
          const elPronto = document.getElementById('estado-pronto');
          const elNaoSuportado = document.getElementById('estado-nao-suportado');

          function mostrar(el) {
            [elJaInstalado, elAguardando, elPronto, elNaoSuportado].forEach((e) => e.classList.add('hidden'));
            el.classList.remove('hidden');
          }

          if (window.PwaInstalador && window.PwaInstalador.jaInstalado()) {
            mostrar(elJaInstalado);
            return;
          }

          function checarPrompt() {
            if (window.PwaInstalador && window.PwaInstalador.temPromptDisponivel()) {
              mostrar(elPronto);
              return true;
            }
            return false;
          }

          if (!checarPrompt()) {
            const intervalo = setInterval(() => {
              if (checarPrompt()) clearInterval(intervalo);
            }, 300);

            setTimeout(() => {
              clearInterval(intervalo);
              if (!checarPrompt()) mostrar(elNaoSuportado);
            }, 5000);
          }

          document.getElementById('btn-instalar').addEventListener('click', async () => {
            const resultado = await window.PwaInstalador.instalarAgora();
            if (resultado.aceito) {
              mostrar(elJaInstalado);
            }
          });
        })();
      </script>
      ${RODAPE_PAGINA}`);
}

async function paginaIphone(url: URL, env: Env): Promise<Response> {
  const elegibilidade = await verificarElegibilidadePwa(env.DB, url.hostname);

  if (!elegibilidade.elegivel) {
    return respostaHtml(`${cabecalhoPagina("App não disponível")}
      <h1 class="text-2xl font-bold mb-4">📵 App não disponível</h1>
      <p class="text-gray-600">Este site não tem um aplicativo instalável no momento.</p>
      ${RODAPE_PAGINA}`);
  }

  return respostaHtml(`${cabecalhoPagina("Instalar no iPhone")}
      <h1 class="text-2xl font-bold mb-6">🍎 Instalar no iPhone</h1>

      <div id="estado-ja-instalado" class="hidden bg-green-50 text-green-800 rounded-lg p-4 font-medium mb-4">✅ App já instalado neste dispositivo.</div>
      <div id="aviso-navegador-in-app" class="hidden bg-amber-50 text-amber-800 rounded-lg p-4 text-sm mb-4">
        ⚠️ Você está usando o navegador de um app (Instagram/WhatsApp/Facebook). Toque em "⋯" e escolha "Abrir no Safari" antes de continuar.
      </div>
      <ol id="tutorial" class="text-left space-y-4">
        <li class="flex gap-3">
          <span class="flex-shrink-0 w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm">1</span>
          <span>Toque no ícone de <strong>Compartilhar</strong> (□ com seta para cima) na barra do Safari.</span>
        </li>
        <li class="flex gap-3">
          <span class="flex-shrink-0 w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm">2</span>
          <span>Role a lista e toque em <strong>"Adicionar à Tela de Início"</strong>.</span>
        </li>
        <li class="flex gap-3">
          <span class="flex-shrink-0 w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm">3</span>
          <span>Toque em <strong>"Adicionar"</strong> no canto superior direito.</span>
        </li>
      </ol>

      <script>
        (function () {
          if (window.PwaInstalador && window.PwaInstalador.jaInstalado()) {
            document.getElementById('estado-ja-instalado').classList.remove('hidden');
            document.getElementById('tutorial').classList.add('hidden');
          }

          const ua = navigator.userAgent || '';
          const ehInApp = /Instagram|FBAN|FBAV|FB_IAB|WhatsApp|Line\\//i.test(ua);
          if (ehInApp) {
            document.getElementById('aviso-navegador-in-app').classList.remove('hidden');
          }
        })();
      </script>
      ${RODAPE_PAGINA}`);
}
