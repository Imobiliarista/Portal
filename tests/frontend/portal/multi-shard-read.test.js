// Etapa 7 — Escala (§90, §9, §19-22). Proves the portal's own reading path
// (frontend/portal/data.js + filters.js — unchanged since Lote 2, they were
// already shard-count-agnostic) correctly aggregates cards for a city
// spread across more than one shard, exactly as business/publishing.js now
// produces (tests/publishing/sharding.test.js covers the writing side).
//
// Fixtures below are hand-built to the shape a real 2-shard city manifest/
// index/shards would have — this is the Browser's read path, so no R2
// binding or FakeR2Bucket involved, just a mocked `fetch` (same pattern as
// tests/frontend/portal/data.test.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createDataClient } from "../../../frontend/portal/data.js";
import { filterCards, sortCards, shardsNeededForFilters } from "../../../frontend/portal/filters.js";

function card(id, overrides = {}) {
  return {
    id,
    slug: `imovel-${id}`,
    title: `Imóvel ${id}`,
    purpose: "venda",
    type: "apartamento",
    price: 300000,
    district: "Centro",
    bedrooms: 2,
    bathrooms: 1,
    parkingSpaces: 1,
    area: 60,
    cover: null,
    brokerSlug: "joao",
    featured: false,
    priority: 0,
    ...overrides,
  };
}

const MANIFEST = {
  schemaVersion: 1,
  city: { slug: "sao-paulo", name: "São Paulo", uf: "SP" },
  publicationVersion: 12,
  totalListings: 4,
  pageSize: 300,
  shards: ["001.json", "002.json"],
  lastUpdated: "2026-08-24T00:00:00Z",
};

const SHARD_1 = [card("1"), card("2", { purpose: "venda", price: 500000 })];
const SHARD_2 = [card("3", { purpose: "aluguel", price: 1800 }), card("4", { district: "Gleba" })];

const INDEX = [
  { id: "1", slug: "imovel-1", shard: 1, purpose: "venda", type: "apartamento", district: "centro", price: 300000 },
  { id: "2", slug: "imovel-2", shard: 1, purpose: "venda", type: "apartamento", district: "centro", price: 500000 },
  { id: "3", slug: "imovel-3", shard: 2, purpose: "aluguel", type: "apartamento", district: "centro", price: 1800 },
  { id: "4", slug: "imovel-4", shard: 2, purpose: "venda", type: "apartamento", district: "gleba", price: 300000 },
];

const FIXTURES = {
  "https://dados.imobiliarista.net/cities/sao-paulo/manifest.json": MANIFEST,
  "https://dados.imobiliarista.net/cities/sao-paulo/index.json": INDEX,
  "https://dados.imobiliarista.net/cities/sao-paulo/001.json": SHARD_1,
  "https://dados.imobiliarista.net/cities/sao-paulo/002.json": SHARD_2,
};

async function withFetchFixtures(fn) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (!(url in FIXTURES)) return new Response(null, { status: 404 });
    return new Response(JSON.stringify(FIXTURES[url]), { status: 200 });
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test("reading a 2-shard city: the manifest lists both shards and the index resolves each listing to its shard", async () => {
  await withFetchFixtures(async () => {
    const client = createDataClient("https://dados.imobiliarista.net");
    const manifest = await client.cityManifest("sao-paulo");
    assert.deepEqual(manifest.shards, ["001.json", "002.json"]);

    const index = await client.cityIndex("sao-paulo");
    assert.deepEqual(
      shardsNeededForFilters(index, {}),
      [1, 2],
      "no filter narrows it — both shards are needed to show everything",
    );
  });
});

test("a filter that only matches listings in shard 2 fetches only shard 2, not shard 1 (§21-22)", async () => {
  await withFetchFixtures(async () => {
    const client = createDataClient("https://dados.imobiliarista.net");
    const index = await client.cityIndex("sao-paulo");
    const shardPlan = shardsNeededForFilters(index, { purpose: "aluguel" });
    assert.deepEqual(shardPlan, [2]);

    const requestedUrls = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      requestedUrls.push(url);
      return previousFetch(url);
    };
    try {
      for (const shardNumber of shardPlan) await client.cityShard("sao-paulo", shardNumber);
    } finally {
      globalThis.fetch = previousFetch;
    }
    assert.deepEqual(requestedUrls, ["https://dados.imobiliarista.net/cities/sao-paulo/002.json"]);
  });
});

test("loading every shard of a multi-shard city and combining them reproduces the full, correctly sorted card set", async () => {
  await withFetchFixtures(async () => {
    const client = createDataClient("https://dados.imobiliarista.net");
    const manifest = await client.cityManifest("sao-paulo");

    let cards = [];
    for (let i = 0; i < manifest.shards.length; i += 1) {
      const shardCards = await client.cityShard("sao-paulo", i + 1);
      cards = [...cards, ...filterCards(shardCards, {})];
    }
    assert.equal(cards.length, manifest.totalListings);
    assert.deepEqual(
      new Set(cards.map((c) => c.id)),
      new Set(["1", "2", "3", "4"]),
      "cards from both shards must be present",
    );

    const sorted = sortCards(cards, "price-desc");
    assert.deepEqual(sorted.map((c) => c.id), ["2", "1", "4", "3"]);
  });
});
