// frontend/service-worker.js
//
// GERADO por scripts/generate-pwa-assets.js a partir de
// modules/pwa/service-worker.js — não editar à mão (§48, módulo pwa).
// Regenerar com: npm run generate:pwa

const SHELL_CACHE_NAME = "imob-pwa-shell-v6b2d3324ec33";
const JSON_CACHE_NAME = "imob-pwa-json-v6b2d3324ec33";
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
    if (response.ok) {
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
  const jsonKind = classifyJsonRequestKind(url.pathname);
  if (jsonKind) {
    event.respondWith(handleJsonRequest(request, jsonKind));
    return;
  }

  if (url.origin === self.location.origin && SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(handleShellRequest(request));
  }
});
