// Etapa 7 — Escala (§90, §7-9, §32-34). Particionamento real por shard,
// contra business/publishing.js + FakeR2Bucket — mesmo padrão de
// tests/publishing/publishing.test.js (Etapa 6), que continua cobrindo o
// caminho de shard único sem nenhuma mudança (regressão implícita em todos
// os testes daquele arquivo). Aqui: o que muda especificamente nesta etapa.

import { test } from "node:test";
import assert from "node:assert/strict";
import { publishListing, rebuildCity } from "../../business/publishing.js";
import { createBroker } from "../../business/brokers.js";
import { createListing, updateListing } from "../../business/listings.js";
import { getPublic } from "../../storage/public.js";
import { getPrivate } from "../../storage/private.js";
import { MAX_CARDS_PER_SHARD } from "../../storage/keys.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";
import { nextCpf } from "../support/cpf.js";

// §27 hotfix (PR #19) — createBroker now requires a real CPF plus the live
// LOGIN_INDEX_SECRET to key it (storage/indexes.js).
const LOGIN_INDEX_SECRET = "test-login-index-secret-do-not-use-in-prod";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket(), IMOB_DATA: new FakeR2Bucket() };
}

async function makeBroker(env) {
  return createBroker(
    env,
    {
      userId: "user_1",
      slug: "joao",
      name: "João Imóveis",
      plan: "premium",
      status: "active",
      creci: "12345-F",
      cpf: nextCpf(),
    },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
}

async function publishNewActiveListing(env, brokerId, { city, slug, index }) {
  const draft = await createListing(env, brokerId, {
    city,
    slug,
    title: `Imóvel ${index}`,
    purpose: "venda",
    type: "apartamento",
    price: 300000 + index,
    district: "Centro",
    status: "active",
    features: { bedrooms: 2, bathrooms: 1, parkingSpaces: 1, area: 60 },
  });
  await publishListing(env, draft.listingId);
  return draft;
}

// --- publicação força criação de novo shard (§9) + atribuição sticky ------

test("publishing the 301st active listing in a city opens a second shard (§9), and earlier listings' shard assignment stays sticky across the growth", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const citySlug = "londrina";

  const listings = [];
  for (let i = 1; i <= MAX_CARDS_PER_SHARD + 1; i += 1) {
    listings.push(
      await publishNewActiveListing(env, broker.brokerId, { city: citySlug, slug: `imovel-${i}`, index: i }),
    );
  }

  const manifest = await getPublic(env, "cities/londrina/manifest.json");
  assert.deepEqual(manifest.shards, ["001.json", "002.json"]);
  assert.equal(manifest.totalListings, MAX_CARDS_PER_SHARD + 1);

  const shard1 = await getPublic(env, "cities/londrina/001.json");
  const shard2 = await getPublic(env, "cities/londrina/002.json");
  assert.equal(shard1.length, MAX_CARDS_PER_SHARD);
  assert.equal(shard2.length, 1);
  assert.equal(shard2[0].id, listings[MAX_CARDS_PER_SHARD].listingId); // the 301st, which forced the new shard

  const index = await getPublic(env, "cities/londrina/index.json");
  assert.equal(index.length, MAX_CARDS_PER_SHARD + 1);
  const firstListingIndexEntry = index.find((entry) => entry.id === listings[0].listingId);
  const lastListingIndexEntry = index.find((entry) => entry.id === listings[MAX_CARDS_PER_SHARD].listingId);
  assert.equal(firstListingIndexEntry.shard, 1);
  assert.equal(lastListingIndexEntry.shard, 2);

  const firstListingManifest = await getPrivate(env, `listings/${listings[0].listingId}/manifest.json`);
  assert.equal(firstListingManifest.publishedShard, 1);

  // Decisão 4a (business/publishing.js): editar o primeiro anúncio (já em
  // shard 1) não o move para outro shard, mesmo com um shard 2 já existindo.
  await updateListing(env, broker.brokerId, listings[0].listingId, { price: 999999 });
  await publishListing(env, listings[0].listingId);

  const shard1AfterEdit = await getPublic(env, "cities/londrina/001.json");
  const shard2AfterEdit = await getPublic(env, "cities/londrina/002.json");
  assert.equal(shard1AfterEdit.length, MAX_CARDS_PER_SHARD, "editing must not move the card out of its shard");
  assert.equal(shard2AfterEdit.length, 1, "shard 2 must be untouched by an edit to a shard-1 listing");
  const editedCard = shard1AfterEdit.find((card) => card.id === listings[0].listingId);
  assert.equal(editedCard.price, 999999);
});

// --- regressão: cidade com shard único continua funcionando -----------------

test("regression: a small city (well under the §9 limits) still publishes into a single 001.json shard, unchanged from Etapa 6", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const citySlug = "curitiba";

  await publishNewActiveListing(env, broker.brokerId, { city: citySlug, slug: "imovel-a", index: 1 });
  await publishNewActiveListing(env, broker.brokerId, { city: citySlug, slug: "imovel-b", index: 2 });
  await publishNewActiveListing(env, broker.brokerId, { city: citySlug, slug: "imovel-c", index: 3 });

  const manifest = await getPublic(env, "cities/curitiba/manifest.json");
  assert.deepEqual(manifest.shards, ["001.json"]);
  assert.equal(manifest.totalListings, 3);
  assert.equal(await getPublic(env, "cities/curitiba/002.json"), null);

  const shard = await getPublic(env, "cities/curitiba/001.json");
  assert.equal(shard.length, 3);
});

// --- rebuild reparticiona uma cidade que excedeu o limite (§33-34) --------

test("rebuildCity shrinks a city back to fewer shards once enough listings are removed, deleting the now-orphaned shard file", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const citySlug = "sao-paulo";
  const total = MAX_CARDS_PER_SHARD + 2; // 302 -> opens a 2nd shard (300 + 2)

  const listings = [];
  for (let i = 1; i <= total; i += 1) {
    listings.push(
      await publishNewActiveListing(env, broker.brokerId, { city: citySlug, slug: `sp-imovel-${i}`, index: i }),
    );
  }

  let manifest = await getPublic(env, "cities/sao-paulo/manifest.json");
  assert.deepEqual(manifest.shards, ["001.json", "002.json"]);

  // Remove the last 52 listings published (the 2 that live in shard 2, plus
  // 50 from the tail of shard 1) — 250 stay active, comfortably fitting in
  // a single shard again.
  const toRemove = listings.slice(total - 52);
  for (const listing of toRemove) {
    await updateListing(env, broker.brokerId, listing.listingId, { status: "removed" });
    await publishListing(env, listing.listingId);
  }

  manifest = await getPublic(env, "cities/sao-paulo/manifest.json");
  assert.equal(manifest.totalListings, 250);
  // Removal alone never re-partitions (§32 is incremental, in-place) — the
  // now-sparse shard 2 (0 cards) stays listed until something rebuilds it.
  assert.deepEqual(manifest.shards, ["001.json", "002.json"]);
  const shard2BeforeRebuild = await getPublic(env, "cities/sao-paulo/002.json");
  assert.equal(shard2BeforeRebuild.length, 0);

  const rebuiltManifest = await rebuildCity(env, citySlug);

  assert.deepEqual(rebuiltManifest.shards, ["001.json"]);
  assert.equal(rebuiltManifest.totalListings, 250);

  const shard1AfterRebuild = await getPublic(env, "cities/sao-paulo/001.json");
  assert.equal(shard1AfterRebuild.length, 250);
  assert.equal(
    await getPublic(env, "cities/sao-paulo/002.json"),
    null,
    "the orphaned shard file must be deleted, not just dropped from manifest.shards",
  );

  const indexAfterRebuild = await getPublic(env, "cities/sao-paulo/index.json");
  assert.equal(indexAfterRebuild.length, 250);
  assert.ok(indexAfterRebuild.every((entry) => entry.shard === 1));

  // publishedShard tracked per listing must match the rebuild's own
  // placement (decision 4 in business/publishing.js), so the next
  // incremental publish finds each listing in the right place.
  const survivingListing = listings[0];
  const survivingManifest = await getPrivate(env, `listings/${survivingListing.listingId}/manifest.json`);
  assert.equal(survivingManifest.publishedShard, 1);
});
