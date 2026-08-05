const CACHE_NAME = 'portal-imobiliario-v1';
const ASSETS_CACHE = 'portal-assets-v1';
const JSON_CACHE = 'portal-json-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/painel/index.html',
  '/manifest.json',
  '/assets/css/tailwind.css',
  '/assets/js/app.js',
  '/assets/js/filtros.js',
  '/assets/js/mapa.js',
  '/assets/js/painel.js',
  '/assets/js/painel-superadmin.js',
  '/assets/js/cache-buster.js'
];

// Instalar Service Worker e cachear static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSETS_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Se algum asset falhar, continua (alguns podem não existir)
      });
    }).then(() => self.skipWaiting())
  );
});

// Ativar Service Worker e limpar caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== ASSETS_CACHE && cacheName !== JSON_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptar requisições
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requisições para Worker/API
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/painel-api/')) {
    return;
  }

  // Static Assets: network-first com fallback para cache
  if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.includes(asset))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cache = caches.open(ASSETS_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // JSONs de cidade/corretor: cache-first com validação de timestamp
  if (url.pathname.includes('/cidades/') || url.pathname.includes('/corretores/')) {
    // Se é um arquivo _index.json, validar timestamp
    if (url.pathname.includes('_index.json')) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              caches.open(JSON_CACHE).then((cache) => {
                cache.put(request, response.clone());
              });
            }
            return response;
          })
          .catch(() => caches.match(request))
      );
    } else {
      // JSONs normais: cache-first
      event.respondWith(
        caches.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) {
              caches.open(JSON_CACHE).then((cache) => {
                cache.put(request, response.clone());
              });
            }
            return response;
          }).catch(() => new Response('Offline', { status: 503 }));
        })
      );
    }
    return;
  }

  // Padrão: network-first para outras requisições
  event.respondWith(
    fetch(request)
      .then((response) => response)
      .catch(() => caches.match(request))
  );
});

// Escutar mensagens do app.js para invalidar cache baseado em timestamp
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'INVALIDATE_CACHE') {
    const { cacheKey, timestamp } = event.data;

    caches.open(JSON_CACHE).then((cache) => {
      cache.keys().then((requests) => {
        requests.forEach((request) => {
          if (request.url.includes(cacheKey)) {
            cache.delete(request);
          }
        });
      });
    });
  }
});
