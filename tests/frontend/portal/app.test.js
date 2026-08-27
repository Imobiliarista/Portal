// frontend/portal/app.js — proves the actual production bug is fixed:
// none of the 4 typed public-data failures (frontend/shared/
// public-data-errors.js) can leave "Carregando…" on screen forever, every
// one offers a working "Tentar novamente", and a failure on one route
// never poisons a later, successful navigation (Etapa 8/10).
//
// Runs against tests/support/fake-dom.js (no jsdom dependency, §94) — only
// the route functions are exercised directly (exported from app.js), not
// full SPA navigation/history wiring, which stays "verified visually"
// per this file's own existing convention (see frontend/portal/render.js
// header).

import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeElement, createFakeDocument } from "../../support/fake-dom.js";
import { renderHomeRoute, renderCityRoute, renderListingRoute, renderComparisonRoute } from "../../../frontend/portal/app.js";
import {
  PublicDataNotFoundError,
  PublicDataHttpError,
  PublicDataNetworkError,
  PublicDataContractError,
} from "../../../frontend/shared/public-data-errors.js";

async function withFakeDocument(fn) {
  const previousDocument = globalThis.document;
  globalThis.document = createFakeDocument();
  try {
    return await fn();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

function findAll(node, predicate, out = []) {
  for (const child of node.children ?? []) {
    if (predicate(child)) out.push(child);
    findAll(child, predicate, out);
  }
  return out;
}

function findRetryButton(container) {
  return findAll(container, (n) => n.tagName === "BUTTON" && n.className === "imob-retry")[0] ?? null;
}

function isLoading(container) {
  return container.textContent.includes("Carregando");
}

function fakeCompareBar() {
  return { refresh() {}, element: new FakeElement("div") };
}

// --- home route: catálogo vazio (Etapa 3 estado vazio) ---------------

test("renderHomeRoute with an empty portal/cities.json renders a valid empty home, not an error", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = { portalCities: async () => [] };
    await renderHomeRoute(container, dataClient);
    assert.equal(isLoading(container), false);
    assert.ok(container.textContent.length > 0);
    assert.equal(findRetryButton(container), null); // sucesso, sem botão de retry
  });
});

// --- as 4 falhas tipadas nunca deixam "Carregando…" travado -----------

for (const [label, ErrorClass, factory] of [
  ["404 inesperado", PublicDataNotFoundError, (url) => new PublicDataNotFoundError(url)],
  ["HTTP não-2xx", PublicDataHttpError, (url) => new PublicDataHttpError(url, 500)],
  ["rede/CORS", PublicDataNetworkError, (url) => new PublicDataNetworkError(url, new Error("network"))],
  ["JSON inválido", PublicDataContractError, (url) => new PublicDataContractError(url, new SyntaxError("bad json"))],
]) {
  test(`renderHomeRoute: ${label} never leaves "Carregando…" active and offers Tentar novamente`, async () => {
    await withFakeDocument(async () => {
      const container = new FakeElement("div");
      const dataClient = {
        portalCities: async () => {
          throw factory("https://dados.imobiliarista.net/portal/cities.json");
        },
      };
      await renderHomeRoute(container, dataClient);
      assert.equal(isLoading(container), false, `${label} left "Carregando…" on screen`);
      assert.ok(findRetryButton(container), `${label} did not render a retry button`);
    });
  });
}

// --- retry funciona e sucesso após retry renderiza a home ------------

test("clicking Tentar novamente retries and a subsequent success renders the home", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    let attempt = 0;
    const dataClient = {
      portalCities: async () => {
        attempt += 1;
        if (attempt === 1) throw new PublicDataNetworkError("url", new Error("down"));
        return [{ slug: "londrina", name: "Londrina", uf: "PR", totalListings: 1 }];
      },
    };

    await renderHomeRoute(container, dataClient);
    const retryButton = findRetryButton(container);
    assert.ok(retryButton, "expected a retry button after the first failure");

    await retryButton.click();

    assert.equal(attempt, 2);
    assert.equal(isLoading(container), false);
    assert.equal(findRetryButton(container), null, "a successful retry must not still show a retry button");
    assert.match(container.textContent, /Londrina/);
  });
});

// --- rota de cidade: 404 real vs. falha de transporte ------------------

test("renderCityRoute: an unknown city (404 on manifest) renders not-found, not the error state", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = { cityManifest: async () => { throw new PublicDataNotFoundError("url"); } };
    await renderCityRoute(container, dataClient, { citySlug: "cidade-fantasma", filters: {} }, fakeCompareBar());
    assert.equal(isLoading(container), false);
    assert.match(container.textContent, /não encontrada/i);
    assert.equal(findRetryButton(container), null, "a genuine 404 is not-found, not a retry-able failure");
  });
});

test("renderCityRoute: a network failure on the manifest offers retry, never renders not-found", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = { cityManifest: async () => { throw new PublicDataNetworkError("url", new Error("down")); } };
    await renderCityRoute(container, dataClient, { citySlug: "londrina", filters: {} }, fakeCompareBar());
    assert.equal(isLoading(container), false);
    assert.ok(findRetryButton(container));
    assert.doesNotMatch(container.textContent, /não encontrada/i);
  });
});

test("renderCityRoute: a city with zero shards renders the empty-city state (§77), not an error", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = { cityManifest: async () => ({ city: { name: "Londrina" }, shards: [], totalListings: 0 }) };
    await renderCityRoute(container, dataClient, { citySlug: "londrina", filters: {} }, fakeCompareBar());
    assert.equal(isLoading(container), false);
    assert.equal(findRetryButton(container), null);
  });
});

// --- rota de imóvel ------------------------------------------------------

test("renderListingRoute: not-found on the listing itself renders not-found", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = { listing: async () => { throw new PublicDataNotFoundError("url"); } };
    await renderListingRoute(container, dataClient, { slug: "imovel-fantasma" }, fakeCompareBar());
    assert.equal(isLoading(container), false);
    assert.match(container.textContent, /não encontrado/i);
  });
});

test("renderListingRoute: a broker-profile fetch failure (optional data) never blocks the listing page itself", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = {
      listing: async () => ({
        slug: "imovel-1",
        title: "Apartamento",
        price: 100000,
        purpose: "venda",
        type: "apartamento",
        district: "Centro",
        city: "Londrina",
        features: { bedrooms: 2, bathrooms: 1, parkingSpaces: 1, area: 60 },
        gallery: [],
        broker: { slug: "joao", name: "João" },
      }),
      brokerProfile: async () => { throw new PublicDataNetworkError("url", new Error("down")); },
    };
    await renderListingRoute(container, dataClient, { slug: "imovel-1" }, fakeCompareBar());
    assert.equal(isLoading(container), false);
    assert.match(container.textContent, /Apartamento/);
    // não é o estado de erro genérico — a página do imóvel renderizou.
    assert.equal(findRetryButton(container), null);
  });
});

// --- comparação: 404 filtra, falha real interrompe com retry -----------

test("renderComparisonRoute: a listing that 404s is silently dropped (§77), others still render", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = {
      listing: async (slug) => {
        if (slug === "sumiu") throw new PublicDataNotFoundError("url");
        return {
          slug,
          title: `Imóvel ${slug}`,
          price: 100000,
          purpose: "venda",
          type: "apartamento",
          district: "Centro",
          city: "Londrina",
          features: { bedrooms: 2, bathrooms: 1, parkingSpaces: 1, area: 60 },
          gallery: [],
          broker: { slug: "joao", name: "João" },
        };
      },
    };
    const originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = {
      _store: { "imob:comparison": JSON.stringify(["existe", "sumiu"]) },
      getItem(key) { return this._store[key] ?? null; },
      setItem(key, value) { this._store[key] = value; },
      removeItem(key) { delete this._store[key]; },
    };
    try {
      await renderComparisonRoute(container, dataClient, fakeCompareBar());
    } finally {
      if (originalLocalStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = originalLocalStorage;
    }
    assert.equal(isLoading(container), false);
  });
});

test("renderComparisonRoute: a real transport failure on one listing shows the retry state, not a partial silent result", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = {
      listing: async (slug) => {
        if (slug === "quebra") throw new PublicDataHttpError("url", 503);
        return { slug, title: `Imóvel ${slug}` };
      },
    };
    const originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = {
      _store: { "imob:comparison": JSON.stringify(["ok", "quebra"]) },
      getItem(key) { return this._store[key] ?? null; },
      setItem(key, value) { this._store[key] = value; },
      removeItem(key) { delete this._store[key]; },
    };
    try {
      await renderComparisonRoute(container, dataClient, fakeCompareBar());
    } finally {
      if (originalLocalStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = originalLocalStorage;
    }
    assert.equal(isLoading(container), false);
    assert.ok(findRetryButton(container));
  });
});

// --- erro de uma rota não quebra navegação futura -----------------------

test("a failed home route does not poison a later, independent successful city route", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const compareBar = fakeCompareBar();

    const failingDataClient = { portalCities: async () => { throw new PublicDataNetworkError("url", new Error("down")); } };
    await renderHomeRoute(container, failingDataClient);
    assert.ok(findRetryButton(container));

    const workingDataClient = {
      cityManifest: async () => ({ city: { name: "Londrina" }, shards: [], totalListings: 0 }),
    };
    await renderCityRoute(container, workingDataClient, { citySlug: "londrina", filters: {} }, compareBar);

    assert.equal(isLoading(container), false);
    assert.equal(findRetryButton(container), null);
    assert.match(container.textContent, /Nenhum imóvel encontrado/);
  });
});
