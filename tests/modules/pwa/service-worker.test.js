import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyJsonRequestKind,
  jsonCacheTtlSeconds,
  renderServiceWorkerSource,
  PWA_SHELL_ASSETS,
  PWA_CACHE_VERSION,
} from "../../../modules/pwa/service-worker.js";
import { CACHE_TTL_SECONDS } from "../../../storage/cache.js";

test("classifyJsonRequestKind recognizes every public JSON path shape (storage/keys.js#dataKeys)", () => {
  assert.equal(classifyJsonRequestKind("/portal/cities.json"), "portalCatalog");
  assert.equal(classifyJsonRequestKind("/portal/taxonomy.json"), "portalCatalog");
  assert.equal(classifyJsonRequestKind("/cities/londrina/manifest.json"), "cityManifest");
  assert.equal(classifyJsonRequestKind("/cities/londrina/index.json"), "cityIndex");
  assert.equal(classifyJsonRequestKind("/cities/londrina/001.json"), "cityShard");
  assert.equal(classifyJsonRequestKind("/listings/casa-bonita.json"), "listingPublic");
  assert.equal(classifyJsonRequestKind("/brokers/joao/profile.json"), "brokerProfile");
});

test("classifyJsonRequestKind returns null for shell assets, API and non-public JSON", () => {
  assert.equal(classifyJsonRequestKind("/portal/app.js"), null);
  assert.equal(classifyJsonRequestKind("/api/me/profile"), null);
  assert.equal(classifyJsonRequestKind("/brokers/joao/listings/manifest.json"), null);
  assert.equal(classifyJsonRequestKind("/cities/londrina/search.json"), null);
});

test("jsonCacheTtlSeconds pulls its numbers straight from storage/cache.js — never re-typed", () => {
  const ttls = jsonCacheTtlSeconds();
  assert.equal(ttls.portalCatalog, CACHE_TTL_SECONDS.portalCatalog);
  assert.equal(ttls.cityManifest, CACHE_TTL_SECONDS.cityManifest);
  assert.equal(ttls.cityIndex, CACHE_TTL_SECONDS.cityIndex);
  assert.equal(ttls.cityShard, CACHE_TTL_SECONDS.cityShard);
  assert.equal(ttls.listingPublic, CACHE_TTL_SECONDS.listingPublic);
  assert.equal(ttls.brokerProfile, CACHE_TTL_SECONDS.brokerProfile);
  assert.equal(ttls.media, undefined); // media isn't a JSON kind this module caches
});

test("jsonCacheTtlSeconds throws instead of silently caching forever if a TTL kind goes missing", () => {
  assert.throws(() => jsonCacheTtlSeconds({}));
});

test("renderServiceWorkerSource embeds the real TTLs and shell assets, not placeholders", () => {
  const source = renderServiceWorkerSource();
  assert.match(source, new RegExp(`"cityManifest":\\s*${CACHE_TTL_SECONDS.cityManifest}\\b`));
  assert.match(source, new RegExp(`"listingPublic":\\s*${CACHE_TTL_SECONDS.listingPublic}\\b`));
  for (const asset of PWA_SHELL_ASSETS) {
    assert.ok(source.includes(JSON.stringify(asset)), `expected shell asset ${asset} in generated source`);
  }
  assert.doesNotMatch(source, /\bimport\s|\brequire\(/); // standalone — Static Assets can't resolve cross-boundary imports
});

test("renderServiceWorkerSource is syntactically valid JS", () => {
  assert.doesNotThrow(() => new Function("self", "caches", "fetch", renderServiceWorkerSource()));
});

/**
 * Loads the generated service worker source into a fake SW global scope
 * and returns the captured event listeners plus the in-memory Cache
 * Storage, so tests can exercise the exact code that ships to
 * frontend/service-worker.js (not a hand-written approximation of it).
 */
function loadServiceWorker({ origin = "https://imobiliarista.net", fetchImpl } = {}) {
  const listeners = {};
  const cacheStores = new Map();

  const fakeSelf = {
    location: { origin },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };

  const fakeCaches = {
    async open(name) {
      if (!cacheStores.has(name)) cacheStores.set(name, new Map());
      const store = cacheStores.get(name);
      return {
        async addAll(urls) {
          for (const url of urls) {
            store.set(new URL(url, origin).toString(), new Response("shell-body"));
          }
        },
        async put(request, response) {
          store.set(typeof request === "string" ? request : request.url, response);
        },
        async match(request) {
          return store.get(typeof request === "string" ? request : request.url);
        },
      };
    },
    async keys() {
      return [...cacheStores.keys()];
    },
    async delete(name) {
      return cacheStores.delete(name);
    },
  };

  const factory = new Function("self", "caches", "fetch", renderServiceWorkerSource());
  factory(fakeSelf, fakeCaches, fetchImpl);
  return { listeners, cacheStores, origin };
}

test("install precaches every shell asset", async () => {
  const { listeners, cacheStores } = loadServiceWorker();
  await listeners.install({ waitUntil: (promise) => promise });
  const shellStore = cacheStores.get(`imob-pwa-shell-v${PWA_CACHE_VERSION}`);
  assert.equal(shellStore.size, PWA_SHELL_ASSETS.length);
});

test("fetch: a public JSON GET is served from the network and cached", async () => {
  const url = "https://imobiliarista.net/cities/londrina/manifest.json";
  const fetchImpl = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  const { listeners, cacheStores } = loadServiceWorker({ fetchImpl });

  let responded;
  await listeners.fetch({
    request: new Request(url, { method: "GET" }),
    respondWith: (promise) => {
      responded = promise;
    },
  });
  const response = await responded;
  assert.deepEqual(await response.json(), { ok: true });

  const jsonStore = cacheStores.get(`imob-pwa-json-v${PWA_CACHE_VERSION}`);
  assert.ok(jsonStore.has(url));
});

test("fetch: a public JSON GET falls back to the cache when the network fails, within TTL", async () => {
  const url = "https://imobiliarista.net/cities/londrina/manifest.json";
  let networkCalls = 0;
  const fetchImpl = async () => {
    networkCalls += 1;
    if (networkCalls === 1) return new Response(JSON.stringify({ cached: true }), { status: 200 });
    throw new Error("offline");
  };
  const { listeners } = loadServiceWorker({ fetchImpl });
  const doFetch = () =>
    new Promise((resolve) => {
      listeners.fetch({ request: new Request(url, { method: "GET" }), respondWith: resolve });
    }).then((p) => p);

  await (await doFetch()).json(); // primes the cache via a successful network response

  const offlineResponse = await (await doFetch());
  assert.deepEqual(await offlineResponse.json(), { cached: true });
});

test("fetch: a stale-beyond-TTL cache entry is not served when the network fails", async () => {
  const url = "https://imobiliarista.net/cities/londrina/manifest.json";
  let networkCalls = 0;
  const fetchImpl = async () => {
    networkCalls += 1;
    if (networkCalls === 1) return new Response(JSON.stringify({ cached: true }), { status: 200 });
    throw new Error("offline");
  };
  const { listeners, cacheStores } = loadServiceWorker({ fetchImpl });
  const doFetch = () =>
    new Promise((resolve) => {
      listeners.fetch({ request: new Request(url, { method: "GET" }), respondWith: resolve });
    });

  await (await doFetch()); // primes the cache

  const jsonStore = cacheStores.get(`imob-pwa-json-v${PWA_CACHE_VERSION}`);
  const cachedEntry = jsonStore.get(url);
  const ancientTimestamp = Date.now() - (CACHE_TTL_SECONDS.cityManifest + 60) * 1000;
  const staleEntry = new Response(await cachedEntry.clone().text(), cachedEntry);
  staleEntry.headers.set("x-imob-pwa-cached-at", String(ancientTimestamp));
  jsonStore.set(url, staleEntry);

  await assert.rejects(() => doFetch().then((p) => p));
});

test("fetch does not intercept non-GET requests or unrecognized paths", async () => {
  const { listeners } = loadServiceWorker({ fetchImpl: async () => new Response("x") });
  let intercepted = false;
  await listeners.fetch({
    request: new Request("https://imobiliarista.net/api/me/profile", { method: "POST" }),
    respondWith: () => {
      intercepted = true;
    },
  });
  assert.equal(intercepted, false);

  await listeners.fetch({
    request: new Request("https://imobiliarista.net/some/unknown/path", { method: "GET" }),
    respondWith: () => {
      intercepted = true;
    },
  });
  assert.equal(intercepted, false);
});
