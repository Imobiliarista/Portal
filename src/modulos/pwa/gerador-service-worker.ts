// Gera o service-worker.js servido em /sw.js (Lote 15, seção 4.18).
//
// Estratégia de cache:
// - Casca institucional (shell HTML/CSS/JS, manifest, /apps/*): cache-first,
//   nome de cache versionado (4.6.1) — trocar a versão invalida o cache
//   antigo automaticamente via skipWaiting()/clients.claim().
// - JSONs de anúncio (cidade/corretor/_index) e feed de Publicações (4.19):
//   network-only, NUNCA cacheados — nunca servir anúncio desatualizado.
//
// O SW "suicida" (gerarServiceWorkerSuicida) é gerado só quando o
// corretor perde elegibilidade (módulo desligado na rede ou downgrade de
// plano sem permite_pwa) — ver src/modulos/pwa/logica.ts.

const CASCA_INSTITUCIONAL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/apps",
  "/apps/android",
  "/apps/iphone",
  "/assets/css/tailwind.css",
  "/assets/js/app.js",
  "/assets/js/app-dados.js",
  "/assets/js/app-ui.js",
  "/assets/js/app-roteamento.js",
  "/assets/js/filtros.js",
  "/assets/js/mapa.js",
  "/assets/js/cache-buster.js",
  "/assets/js/pwa-instalador.js",
];

export function gerarServiceWorkerAtivo(versao: string): string {
  const nomeCache = `institucional-${versao}`;
  const listaAssets = JSON.stringify(CASCA_INSTITUCIONAL);

  return `// service-worker.js gerado pelo módulo PWA (seção 4.18 do project.md)
const CACHE_NAME = ${JSON.stringify(nomeCache)};
const CASCA_INSTITUCIONAL = ${listaAssets};

function ehJsonDeAnuncio(url) {
  return (
    url.pathname.includes('/cidades/') ||
    url.pathname.includes('/corretores/') ||
    url.pathname.includes('/publicacoes/')
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CASCA_INSTITUCIONAL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((nome) => nome !== CACHE_NAME).map((nome) => caches.delete(nome)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/painel/') || url.pathname.startsWith('/painel-admin/')) {
    return;
  }

  // JSONs de anúncio e feed de Publicações: network-only, sem fallback de
  // cache — nunca servir dado desatualizado como se fosse atual.
  if (ehJsonDeAnuncio(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Casca institucional: cache-first.
  if (CASCA_INSTITUCIONAL.includes(url.pathname) || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copia = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
          }
          return response;
        });
      })
    );
    return;
  }

  // Padrão: network-first com fallback pro cache (páginas de navegação).
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
`;
}

export function gerarServiceWorkerSuicida(): string {
  return `// service-worker.js "suicida" — módulo PWA desativado ou plano sem
// permite_pwa (seção 4.18 do project.md). Limpa todo cache local,
// desregistra a si mesmo e força reload das abas abertas.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', async () => {
  const nomes = await caches.keys();
  await Promise.all(nomes.map((nome) => caches.delete(nome)));
  await self.registration.unregister();
  self.clients.matchAll().then((clients) => clients.forEach((c) => c.navigate(c.url)));
});
`;
}
