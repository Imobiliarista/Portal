const CACHE_VERSAO = 'portal-v1';
const URLS_CACHE = [
  '/',
  '/assets/css/tailwind.css',
  '/assets/js/app.js',
  '/manifest.json',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_VERSAO).then((cache) => {
      return cache.addAll(URLS_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) => {
      return Promise.all(
        nomes.map((nome) => {
          if (nome !== CACHE_VERSAO) {
            return caches.delete(nome);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') {
    return;
  }

  evento.respondWith(
    caches.match(evento.request).then((resposta) => {
      return (
        resposta ||
        fetch(evento.request).then((novaResposta) => {
          if (!novaResposta || novaResposta.status !== 200) {
            return novaResposta;
          }

          const cache = caches.open(CACHE_VERSAO);
          cache.then((c) => c.put(evento.request, novaResposta.clone()));
          return novaResposta;
        })
      );
    })
  );
});
