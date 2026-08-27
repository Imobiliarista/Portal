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
//     Cache-first nunca revalida sozinho, então SHELL_CACHE_NAME precisa
//     mudar a cada deploy que altera o shell para o `activate` (abaixo)
//     apagar a versão antiga e a próxima visita buscar a nova — daí
//     `computeShellVersion` hashear o conteúdo real dos assets em vez de
//     um número fixo (ver esse comentário mais abaixo).
//   - JSONs públicos (portal/cities.json, cities/{slug}/manifest|index|
//     NNN.json, listings/{slug}.json, brokers/{slug}/profile.json) →
//     network-first (a versão mais nova é sempre a fonte de verdade,
//     §61 `publicationVersion`); se a rede falhar, cai para o cache SÓ
//     se a entrada ainda estiver dentro do TTL do seu tipo (mesmas
//     constantes de storage/cache.js#CACHE_TTL_SECONDS) — nunca serve algo
//     mais velho do que o próprio edge consideraria fresco.

import { createHash } from "node:crypto";
import { CACHE_TTL_SECONDS } from "../../storage/cache.js";

/**
 * Fallback usado só quando `renderServiceWorkerSource` é chamado sem um
 * `version` explícito (ex.: os testes deste módulo, que não têm os
 * arquivos reais de frontend/ em mãos). Em produção,
 * scripts/generate-pwa-assets.js sempre passa `version` = o hash real do
 * conteúdo do shell (ver `computeShellVersion` abaixo) — nunca este valor.
 */
export const PWA_CACHE_VERSION = 2; // Etapa 9 — ver SERVICE_WORKER_LOGIC_VERSION abaixo

/**
 * Versão da LÓGICA do service worker em si (estratégia de fetch/cache),
 * independente do conteúdo dos shell assets. `computeShellVersion` inclui
 * este valor no hash — sem isso, uma mudança só na lógica deste arquivo
 * (ex.: Etapa 9 abaixo, "parar de interceptar origens cross-origin como
 * dados.imobiliarista.net") nunca mudaria `SHELL_CACHE_NAME`/
 * `JSON_CACHE_NAME` se nenhum shell asset também mudasse de conteúdo — e
 * `activate` só apaga um cache cujo NOME mudou, então a lógica velha
 * continuaria instalada indefinidamente em quem já tinha visitado o site.
 * Incrementar este número é o "bump" que a Etapa 9 pede ("incremente a
 * versão do cache para invalidar a versão atualmente instalada") sempre
 * que a estratégia de fetch mudar, mesmo sem nenhum shell asset ter mudado.
 *
 * Etapa 9 (missão "corrigir a falha de produção... encerra o carregamento
 * infinito"): o `fetch` handler passou a nunca interceptar uma requisição
 * cross-origin (antes, `classifyJsonRequestKind` era aplicado a QUALQUER
 * origem, então uma leitura de `https://dados.imobiliarista.net/...` feita
 * por uma página em `https://imobiliarista.net/` também passava por este
 * service worker — nunca deveria: R2 DATA é lido direto do Custom Domain,
 * nunca por um intermediário, e a arquitetura já exige acesso de rede
 * normal com o CORS correto para esse domínio, não uma estratégia de cache
 * pensada para o mesmo-origin shell/JSON local de desenvolvimento).
 */
export const SERVICE_WORKER_LOGIC_VERSION = 2;

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
 * Deriva a versão do cache do shell a partir do conteúdo real dos shell
 * assets, em vez de um número fixo bumpado à mão — era exatamente esse
 * número fixo (`PWA_CACHE_VERSION` nunca mudando de deploy pra deploy) que
 * fazia `SHELL_CACHE_NAME` nunca mudar, e portanto `handleShellRequest`
 * (cache-first, sem revalidação) nunca buscar a rede de novo depois do
 * primeiro `install`: quem já tinha visitado o site ficava preso na
 * versão antiga do app shell para sempre, mesmo após um deploy novo.
 *
 * `assetContents` é `{ path: conteúdo }` — o generator (único lugar com
 * acesso a disco) lê o conteúdo real de cada `shellAssets` em frontend/ e
 * passa aqui. Pura e determinística: mesmo conteúdo sempre produz o mesmo
 * hash, então re-rodar o generator sem nenhuma mudança de shell não força
 * invalidação de cache à toa — só um shell asset realmente diferente muda
 * a versão, e o `activate` já existente cuida de apagar o cache antigo
 * assim que o nome mudar.
 */
export function computeShellVersion(assetContents, shellAssets = PWA_SHELL_ASSETS) {
  const hash = createHash("sha256");
  hash.update(String(SERVICE_WORKER_LOGIC_VERSION));
  hash.update("\0");
  for (const path of shellAssets) {
    hash.update(path);
    hash.update("\0");
    hash.update(assetContents[path] ?? "");
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
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
`;
}
