// frontend/minisite/app.js#renderMinisiteRoute — Etapa 8's explicit
// requirement for the minisite: distinguish "corretor não encontrado"
// (§75), "perfil suspenso" (§76), and "dados temporariamente
// indisponíveis" (network/CORS/HTTP/contract) — a transport failure must
// never be presented to the visitor as if the minisite didn't exist.

import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeElement, createFakeDocument } from "../../support/fake-dom.js";
import { renderMinisiteRoute } from "../../../frontend/minisite/app.js";
import {
  PublicDataNotFoundError,
  PublicDataNetworkError,
  PublicDataHttpError,
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

test("a broker that genuinely does not exist (404) renders site-not-found", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = { profile: async () => { throw new PublicDataNotFoundError("url"); } };
    await renderMinisiteRoute(container, dataClient, "corretor-fantasma", "/");
    assert.equal(isLoading(container), false);
    assert.match(container.textContent, /não encontrado/i);
    assert.equal(findRetryButton(container), null, "genuine not-found must not offer a retry button");
  });
});

test("a network/CORS failure fetching the profile is NEVER presented as site-not-found", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = { profile: async () => { throw new PublicDataNetworkError("url", new Error("down")); } };
    await renderMinisiteRoute(container, dataClient, "joao", "/");
    assert.equal(isLoading(container), false);
    assert.doesNotMatch(container.textContent, /minisite não encontrado/i);
    assert.ok(findRetryButton(container), "a transport failure must offer Tentar novamente");
  });
});

test("an HTTP error fetching the profile also offers retry, distinct from not-found", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = { profile: async () => { throw new PublicDataHttpError("url", 503); } };
    await renderMinisiteRoute(container, dataClient, "joao", "/");
    assert.equal(isLoading(container), false);
    assert.doesNotMatch(container.textContent, /minisite não encontrado/i);
    assert.ok(findRetryButton(container));
  });
});

test("a suspended broker (profile.status !== active) renders the suspended state, not not-found or an error", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = { profile: async () => ({ status: "suspended", slug: "joao", name: "João" }) };
    await renderMinisiteRoute(container, dataClient, "joao", "/");
    assert.equal(isLoading(container), false);
    assert.match(container.textContent, /indispon[íi]vel/i);
    assert.equal(findRetryButton(container), null);
  });
});

test("an active broker with zero listings renders a valid empty profile, not an error", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = {
      profile: async () => ({ status: "active", slug: "joao", name: "João Imóveis" }),
      listingsFlat: async () => { throw new PublicDataNotFoundError("url"); },
      listingsManifest: async () => { throw new PublicDataNotFoundError("url"); },
    };
    await renderMinisiteRoute(container, dataClient, "joao", "/");
    assert.equal(isLoading(container), false);
    assert.match(container.textContent, /João Imóveis/);
    assert.match(container.textContent, /Nenhum imóvel publicado/);
    assert.equal(findRetryButton(container), null);
  });
});

test("a listing 404 on the imóvel route renders not-found, not the generic error state", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    const dataClient = {
      profile: async () => ({ status: "active", slug: "joao", name: "João" }),
      listing: async () => { throw new PublicDataNotFoundError("url"); },
    };
    await renderMinisiteRoute(container, dataClient, "joao", "/imovel/inexistente");
    assert.equal(isLoading(container), false);
    assert.match(container.textContent, /Imóvel não encontrado/);
  });
});

test("clicking Tentar novamente after a profile network failure retries and can succeed", async () => {
  await withFakeDocument(async () => {
    const container = new FakeElement("div");
    let attempt = 0;
    const dataClient = {
      profile: async () => {
        attempt += 1;
        if (attempt === 1) throw new PublicDataNetworkError("url", new Error("down"));
        return { status: "active", slug: "joao", name: "João Imóveis" };
      },
      listingsFlat: async () => { throw new PublicDataNotFoundError("url"); },
      listingsManifest: async () => { throw new PublicDataNotFoundError("url"); },
    };

    await renderMinisiteRoute(container, dataClient, "joao", "/");
    const retryButton = findRetryButton(container);
    assert.ok(retryButton);

    await retryButton.click();

    assert.equal(attempt, 2);
    assert.equal(isLoading(container), false);
    assert.equal(findRetryButton(container), null);
    assert.match(container.textContent, /João Imóveis/);
  });
});
