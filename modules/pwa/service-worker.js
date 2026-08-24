// modules/pwa/service-worker.js
//
// Módulo pwa (§48) — fonte do service worker mínimo do portal. Não é
// servido diretamente: Workers Static Assets só publica arquivos dentro
// de `frontend/` (wrangler.toml `[assets] directory = "frontend"`), então
// um service worker de browser não pode viver em `modules/pwa/` nem
// importar `storage/cache.js` em runtime (o browser nunca alcançaria esse
// caminho). Em vez disso este arquivo é um GERADOR: exporta dado (as TTLs,
// via `storage/cache.js` — MODULES pode depender de STORAGE, §39) e as
// funções puras que viram o corpo do service worker, e
// `renderServiceWorkerSource` embute as duas coisas (dado real + código
// real, nunca reescrito à mão) num único arquivo standalone, sem imports,
// que scripts/generate-pwa-assets.js grava em frontend/service-worker.js
// (Static Asset real — §94). Isso satisfaz "reaproveitar as constantes
// existentes, sem duplicar TTLs": o número nunca é digitado duas vezes,
// só serializado.
//
// Estratégia de cache (§59-§61):
//   - App shell (frontend/portal/*) → cache-first no `install`, sempre
//     com fallback de rede — mesmo espírito do cache automático de Static
//     Assets da Cloudflare (§59), só que também disponível offline.
//   - JSONs públicos (portal/cities.json, cities/{slug}/manifest|index|
//     NNN.json, listings/{slug}.json, brokers/{slug}/profile.json) →
//     network-first (a versão mais nova é sempre a fonte de verdade,
//     §61 `publicationVersion`); se a rede falhar, cai para o cache SÓ
//     se a entrada ainda estiver dentro do TTL do seu tipo (mesmas
//     constantes de storage/cache.js#CACHE_TTL_SECONDS) — nunca serve algo
//     mais velho do que o próprio edge consideraria fresco.

import { CACHE_TTL_SECONDS } from "../../storage/cache.js";

export const PWA_CACHE_VERSION = 1;

/** App shell do portal (frontend/portal/) — únicos arquivos precacheados neste lote (§48, escopo do módulo). */
export const PWA_SHELL_ASSETS = Object.freeze([
  "/",
  "/manifest.json",
  "/portal/app.js",
  "/portal/router.js",
  "/portal/data.js",
  "/portal/filters.js",
  "/portal/render.js",
  "/portal/styles/main.css",
]);

/**
 * Mapeia pathname → chave de storage/cache.js#CACHE_TTL_SECONDS, no
 * mesmo formato de storage/keys.js#dataKeys. `source` é texto de regex
 * (não RegExp) para poder ser serializado como JSON puro dentro do
 * service worker gerado.
 */
export const JSON_CACHE_PATTERNS = Object.freeze([
  Object.freeze({ kind: "portalCatalog", source: "^/portal/(cities|taxonomy)\\.json$" }),
  Object.freeze({ kind: "cityManifest", source: "^/cities/[^/]+/manifest\\.json$" }),
  Object.freeze({ kind: "cityIndex", source: "^/cities/[^/]+/index\\.json$" }),
  Object.freeze({ kind: "cityShard", source: "^/cities/[^/]+/\\d{3}\\.json$" }),
  Object.freeze({ kind: "listingPublic", source: "^/listings/[^/]+\\.json$" }),
  Object.freeze({ kind: "brokerProfile", source: "^/brokers/[^/]+/profile\\.json$" }),
]);

/**
 * Pura. Recebe um pathname (`new URL(request.url).pathname`) e devolve o
 * `kind` (chave de CACHE_TTL_SECONDS) ou `null` se não for um JSON público
 * conhecido. `.toString()` desta função é embutido literalmente no service
 * worker gerado (ver `renderServiceWorkerSource`) — o mesmo código testado
 * aqui em Node é o que roda no browser, nunca uma cópia reescrita à mão.
 */
export function classifyJsonRequestKind(pathname, patterns = JSON_CACHE_PATTERNS) {
  for (const entry of patterns) {
    if (new RegExp(entry.source).test(pathname)) return entry.kind;
  }
  return null;
}

/**
 * Só as chaves de CACHE_TTL_SECONDS que `JSON_CACHE_PATTERNS` referencia —
 * "media" (TTL longo, objeto versionado) não é um JSON buscado pelo
 * portal e fica de fora de propósito.
 */
export function jsonCacheTtlSeconds(ttlSeconds = CACHE_TTL_SECONDS) {
  const kinds = new Set(JSON_CACHE_PATTERNS.map((entry) => entry.kind));
  const result = {};
  for (const kind of kinds) {
    if (ttlSeconds[kind] === undefined) {
      throw new Error(`modules/pwa/service-worker: TTL ausente em storage/cache.js para "${kind}".`);
    }
    result[kind] = ttlSeconds[kind];
  }
  return result;
}

/**
 * Gera o texto completo (standalone, sem imports) do service worker que
 * vai para frontend/service-worker.js. `ttlSeconds`/`shellAssets` têm
 * default nos valores reais deste módulo, mas ficam parametrizáveis para
 * teste.
 */
export function renderServiceWorkerSource({
  version = PWA_CACHE_VERSION,
  shellAssets = PWA_SHELL_ASSETS,
  jsonPatterns = JSON_CACHE_PATTERNS,
  ttlSeconds = jsonCacheTtlSeconds(),
} = {}) {
  return `// frontend/service-worker.js
//
// GERADO por scripts/generate-pwa-assets.js a partir de
// modules/pwa/service-worker.js — não editar à mão (§48, módulo pwa).
// Regenerar com: npm run generate:pwa

const SHELL_CACHE_NAME = "imob-pwa-shell-v${version}";
const JSON_CACHE_NAME = "imob-pwa-json-v${version}";
const SHELL_ASSETS = ${JSON.stringify(shellAssets, null, 2)};
const JSON_CACHE_PATTERNS = ${JSON.stringify(jsonPatterns, null, 2)};
const JSON_CACHE_TTL_SECONDS = ${JSON.stringify(ttlSeconds, null, 2)};

${classifyJsonRequestKind.toString()}

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
`;
}
