// frontend/service-worker.js
//
// GERADO por scripts/generate-pwa-assets.js a partir de
// modules/pwa/service-worker.js — não editar à mão (§48, módulo pwa).
// Regenerar com: npm run generate:pwa

const SHELL_CACHE_NAME = "imob-pwa-shell-v5b3d01d6148b";
const JSON_CACHE_NAME = "imob-pwa-json-v5b3d01d6148b";
const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/portal/app.js",
  "/portal/router.js",
  "/portal/data.js",
  "/portal/filters.js",
  "/portal/render.js",
  "/portal/styles/main.css"
];
const JSON_CACHE_PATTERNS = [
  {
    "kind": "portalCatalog",
    "source": "^/portal/(cities|taxonomy)\\.json$"
  },
  {
    "kind": "cityManifest",
    "source": "^/cities/[^/]+/manifest\\.json$"
  },
  {
    "kind": "cityIndex",
    "source": "^/cities/[^/]+/index\\.json$"
  },
  {
    "kind": "cityShard",
    "source": "^/cities/[^/]+/\\d{3}\\.json$"
  },
  {
    "kind": "listingPublic",
    "source": "^/listings/[^/]+\\.json$"
  },
  {
    "kind": "brokerProfile",
    "source": "^/brokers/[^/]+/profile\\.json$"
  }
];
const JSON_CACHE_TTL_SECONDS = {
  "portalCatalog": 300,
  "cityManifest": 60,
  "cityIndex": 300,
  "cityShard": 300,
  "listingPublic": 300,
  "brokerProfile": 300
};

function classifyJsonRequestKind(pathname, patterns = JSON_CACHE_PATTERNS) {
  for (const entry of patterns) {
    if (new RegExp(entry.source).test(pathname)) return entry.kind;
  }
  return null;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE_NAME && key !== JSON_CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function handleJsonRequest(request, kind) {
  const cache = await caches.open(JSON_CACHE_NAME);
  try {
    const response = await fetch(request);
    // response.type === "opaque" só pode acontecer para uma requisição
    // cross-origin em modo no-cors — este handler agora só é alcançado
    // para o mesmo-origin deste service worker (ver o filtro no listener
    // de "fetch" abaixo), então isto nunca deveria disparar; mantido como
    // guarda explícita (Etapa 9 "não deve colocar em cache respostas
    // opacas") em vez de confiar implicitamente nisso.
    if (response.ok && response.type !== "opaque") {
      const cachedAt = new Response(response.clone().body, response);
      cachedAt.headers.set("x-imob-pwa-cached-at", String(Date.now()));
      await cache.put(request, cachedAt);
    }
    return response;
  } catch (networkError) {
    const cached = await cache.match(request);
    if (!cached) throw networkError;
    const cachedAt = Number(cached.headers.get("x-imob-pwa-cached-at") ?? 0);
    const ageSeconds = (Date.now() - cachedAt) / 1000;
    if (ageSeconds > JSON_CACHE_TTL_SECONDS[kind]) throw networkError;
    return cached;
  }
}

async function handleShellRequest(request) {
  const cache = await caches.open(SHELL_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Etapa 9 — nunca intercepta uma requisição cross-origin (em especial
  // dados.imobiliarista.net/media.imobiliarista.net, os Custom Domains de
  // R2 DATA/MEDIA): essas leituras devem sempre ir por acesso de rede
  // normal, com o CORS do próprio Custom Domain, nunca mascaradas por este
  // service worker (que só existe para o shell/JSON do MESMO origin em
  // que está registrado). Sem este filtro, classifyJsonRequestKind (que só
  // olha o pathname) casaria "/portal/cities.json" mesmo quando a URL
  // completa é https://dados.imobiliarista.net/portal/cities.json.
  if (url.origin !== self.location.origin) return;

  const jsonKind = classifyJsonRequestKind(url.pathname);
  if (jsonKind) {
    event.respondWith(handleJsonRequest(request, jsonKind));
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(handleShellRequest(request));
  }
});
