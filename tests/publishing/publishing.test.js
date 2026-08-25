// Etapa 6 — Publicador (§31-34, §64). End-to-end over business/publishing.js
// against FakeR2Bucket-backed IMOB_PRIVATE + IMOB_DATA — no worker/router
// involved (that wiring is covered by tests/security/painel-api.test.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publishListing,
  publishBroker,
  rebuildListing,
  rebuildBroker,
  rebuildCity,
  rebuildAll,
  republishBrokerListings,
  PublishValidationError,
  ListingNotFoundError,
} from "../../business/publishing.js";
import { UnknownCityError } from "../../business/cities.js";
import { createBroker, suspendBroker, reactivateBroker } from "../../business/brokers.js";
import { createListing, updateListing } from "../../business/listings.js";
import { getPublic, putPublic } from "../../storage/public.js";
import { getPrivate } from "../../storage/private.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket(), IMOB_DATA: new FakeR2Bucket() };
}

async function makeBroker(env, overrides = {}) {
  return createBroker(env, {
    userId: overrides.userId ?? "user_1",
    slug: overrides.slug ?? "joao",
    name: overrides.name ?? "João Imóveis",
    plan: "premium",
    status: overrides.status ?? "active",
    creci: overrides.creci ?? "12345-F",
  });
}

function baseListingInput(overrides = {}) {
  return {
    city: "londrina",
    slug: "apartamento-centro-123",
    title: "Apartamento no Centro",
    purpose: "venda",
    type: "apartamento",
    price: 450000,
    district: "Centro",
    features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, area: 95 },
    ...overrides,
  };
}

// --- publicação incremental (§32) ------------------------------------------

test("publishListing no-ops for a listing that's still status:draft and was never published", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, baseListingInput());

  const result = await publishListing(env, draft.listingId);
  assert.equal(result.published, false);
  assert.equal(result.reason, "draft");
  assert.equal(await env.IMOB_DATA.get("listings/apartamento-centro-123.json"), null);
  assert.equal(await env.IMOB_DATA.get("cities/londrina/001.json"), null);
});

test("publishListing writes the full listing, its card, the city index entry, and bumps the city manifest", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));

  const result = await publishListing(env, draft.listingId);
  assert.equal(result.published, true);
  assert.equal(result.cardActive, true);

  const listingPublic = await getPublic(env, "listings/apartamento-centro-123.json");
  assert.equal(listingPublic.status, "active");
  assert.equal(listingPublic.publicationVersion, 1);
  assert.equal(listingPublic.broker.slug, "joao");
  assert.equal(listingPublic.location.district, "Centro");

  const shard = await getPublic(env, "cities/londrina/001.json");
  assert.equal(shard.length, 1);
  assert.equal(shard[0].id, draft.listingId);

  const index = await getPublic(env, "cities/londrina/index.json");
  assert.equal(index.length, 1);
  assert.equal(index[0].shard, 1);

  const manifest = await getPublic(env, "cities/londrina/manifest.json");
  assert.equal(manifest.totalListings, 1);
  assert.equal(manifest.publicationVersion, 1);
  assert.deepEqual(manifest.shards, ["001.json"]);
  assert.equal(manifest.city.uf, "PR");
});

// §46 — zipcode is optional on the draft (business/listings.js) but, when
// present, must reach the public projection: it's what
// modules/feeds/generator.js needs to include a listing in the OLX feed
// (required there, not here).
test("publishListing carries zipcode through to location.zipcode when the draft has one", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active", zipcode: "86010-000" }));

  await publishListing(env, draft.listingId);
  const listingPublic = await getPublic(env, "listings/apartamento-centro-123.json");
  assert.equal(listingPublic.location.zipcode, "86010-000");
});

test("publishListing omits location.zipcode entirely when the draft has none", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));

  await publishListing(env, draft.listingId);
  const listingPublic = await getPublic(env, "listings/apartamento-centro-123.json");
  assert.equal("zipcode" in listingPublic.location, false);
});

test("publishListing only touches the affected city's shard — other cities are untouched", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const listingA = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));
  const listingB = await createListing(
    env,
    broker.brokerId,
    baseListingInput({ slug: "casa-sp", city: "sao-paulo", status: "active" }),
  );

  await publishListing(env, listingA.listingId);
  await publishListing(env, listingB.listingId);

  const londrinaShard = await getPublic(env, "cities/londrina/001.json");
  const spShard = await getPublic(env, "cities/sao-paulo/001.json");
  assert.equal(londrinaShard.length, 1);
  assert.equal(londrinaShard[0].id, listingA.listingId);
  assert.equal(spShard.length, 1);
  assert.equal(spShard[0].id, listingB.listingId);
});

test("each publish that touches a city bumps its manifest's publicationVersion", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));

  await publishListing(env, draft.listingId);
  let manifest = await getPublic(env, "cities/londrina/manifest.json");
  assert.equal(manifest.publicationVersion, 1);

  await updateListing(env, broker.brokerId, draft.listingId, { price: 500000 });
  await publishListing(env, draft.listingId);
  manifest = await getPublic(env, "cities/londrina/manifest.json");
  assert.equal(manifest.publicationVersion, 2);
});

test("changing a listing's city removes its card from the old city and adds it to the new one, updating both manifests", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));
  await publishListing(env, draft.listingId);

  await updateListing(env, broker.brokerId, draft.listingId, { city: "sao-paulo" });
  await publishListing(env, draft.listingId);

  const londrinaShard = await getPublic(env, "cities/londrina/001.json");
  const spShard = await getPublic(env, "cities/sao-paulo/001.json");
  assert.equal(londrinaShard.length, 0);
  assert.equal(spShard.length, 1);
  assert.equal(spShard[0].id, draft.listingId);

  const londrinaManifest = await getPublic(env, "cities/londrina/manifest.json");
  assert.equal(londrinaManifest.totalListings, 0);
});

// --- remoção / vendido (§64) ------------------------------------------------

test("removing a previously active listing pulls its card but keeps listings/{slug}.json resolvable with an explicit status", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));
  await publishListing(env, draft.listingId);

  await updateListing(env, broker.brokerId, draft.listingId, { status: "removed" });
  const result = await publishListing(env, draft.listingId);
  assert.equal(result.published, true);
  assert.equal(result.cardActive, false);

  const shard = await getPublic(env, "cities/londrina/001.json");
  assert.equal(shard.length, 0);

  const listingPublic = await getPublic(env, "listings/apartamento-centro-123.json");
  assert.ok(listingPublic, "listing-public must not be deleted — §64, no silent 404");
  assert.equal(listingPublic.status, "removed");

  const manifest = await getPublic(env, "cities/londrina/manifest.json");
  assert.equal(manifest.totalListings, 0);
});

test("marking a previously active listing as sold pulls its card but keeps listings/{slug}.json resolvable", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));
  await publishListing(env, draft.listingId);

  await updateListing(env, broker.brokerId, draft.listingId, { status: "sold" });
  await publishListing(env, draft.listingId);

  const shard = await getPublic(env, "cities/londrina/001.json");
  assert.equal(shard.length, 0);

  const listingPublic = await getPublic(env, "listings/apartamento-centro-123.json");
  assert.equal(listingPublic.status, "sold");
});

test("a listing that goes straight from draft to sold/removed (never active) never gets a public tombstone", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "sold" }));

  const result = await publishListing(env, draft.listingId);
  assert.equal(result.published, false);
  assert.equal(await env.IMOB_DATA.get("listings/apartamento-centro-123.json"), null);
});

test("reverting a previously-active listing back to draft pulls its card but leaves the last public status untouched", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));
  await publishListing(env, draft.listingId);

  await updateListing(env, broker.brokerId, draft.listingId, { status: "draft" });
  const result = await publishListing(env, draft.listingId);
  assert.equal(result.cardActive, false);

  const shard = await getPublic(env, "cities/londrina/001.json");
  assert.equal(shard.length, 0);

  const listingPublic = await getPublic(env, "listings/apartamento-centro-123.json");
  assert.equal(listingPublic.status, "active"); // last known public state, unchanged
});

// --- erros / validação -------------------------------------------------------

test("publishListing throws ListingNotFoundError for an unknown listingId", async () => {
  const env = makeEnv();
  await assert.rejects(() => publishListing(env, "listing_ghost"), ListingNotFoundError);
});

test("publishListing throws UnknownCityError for a city slug outside the IBGE catalog", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(
    env,
    broker.brokerId,
    baseListingInput({ status: "active", city: "cidade-inexistente" }),
  );
  await assert.rejects(() => publishListing(env, draft.listingId), UnknownCityError);
});

test("publishListing refuses to publish an active listing without a district (gap between listing-public.schema.json and business/listings.js — see PR)", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, {
    city: "londrina",
    slug: "sem-bairro",
    title: "Sem bairro definido",
    purpose: "venda",
    type: "apartamento",
    price: 300000,
    status: "active",
    features: { bedrooms: 2, bathrooms: 1, parkingSpaces: 1, area: 60 },
  });

  await assert.rejects(() => publishListing(env, draft.listingId), PublishValidationError);
});

// --- corretor público (§16, §32) --------------------------------------------

test("publishBroker no-ops while the broker is status:pending (not approved yet)", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, { userId: "user_1", slug: "joao", name: "João", plan: "free" });
  const result = await publishBroker(env, broker.brokerId);
  assert.equal(result.published, false);
  assert.equal(result.reason, "pending");
  assert.equal(await env.IMOB_DATA.get("brokers/joao/profile.json"), null);
});

test("publishBroker writes broker-public with creciPublic mirroring the private creci verbatim", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env, { creci: "12345-F" });
  const result = await publishBroker(env, broker.brokerId);
  assert.equal(result.published, true);
  assert.equal(result.brokerPublic.creciPublic, "12345-F");
  assert.equal(result.brokerPublic.status, "active");
});

test("publishBroker skips rewriting when nothing changed since the last publish, but rebuildBroker (force) always rewrites", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const first = await publishBroker(env, broker.brokerId);
  assert.equal(first.published, true);

  const second = await publishBroker(env, broker.brokerId);
  assert.equal(second.published, false);
  assert.equal(second.reason, "up-to-date");

  let manifest = await getPrivate(env, `brokers/${broker.brokerId}/manifest.json`);
  assert.equal(manifest.publicationVersion, 1);

  const rebuilt = await rebuildBroker(env, broker.brokerId);
  assert.equal(rebuilt.published, true);
  manifest = await getPrivate(env, `brokers/${broker.brokerId}/manifest.json`);
  assert.equal(manifest.publicationVersion, 2);
});

test("publishListing keeps the listing's public broker profile in sync (§32)", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));
  await publishListing(env, draft.listingId);

  const brokerPublic = await getPublic(env, "brokers/joao/profile.json");
  assert.ok(brokerPublic, "publishing a listing should also publish its broker's profile if missing");
  assert.equal(brokerPublic.slug, "joao");
});

// --- Etapa 8 (§53): cascata de suspensão/reativação de corretor sobre anúncios já publicados ---

test("publishing a listing whose broker is suspended forces public status \"suspended\" instead of \"active\", and drops the card", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env, { status: "suspended" });
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));

  const result = await publishListing(env, draft.listingId);
  assert.equal(result.published, true);
  assert.equal(result.cardActive, false);
  assert.equal(result.listingPublic.status, "suspended");

  const shard = await getPublic(env, "cities/londrina/001.json");
  assert.equal(shard, null, "no card should have been placed for a suspended broker's listing");
});

test("suspending a broker via business/brokers.suspendBroker + republishBrokerListings pulls their already-published listings' cards but keeps the public page reachable", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env, { status: "active" });
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));
  await publishListing(env, draft.listingId);

  let shard = await getPublic(env, "cities/londrina/001.json");
  assert.equal(shard.length, 1, "sanity: the listing was live before suspension");

  await suspendBroker(env, broker.brokerId);
  const results = await republishBrokerListings(env, broker.brokerId);
  assert.equal(results.length, 1);
  assert.equal(results[0].cardActive, false);

  shard = await getPublic(env, "cities/londrina/001.json");
  assert.equal(shard.length, 0, "card must be gone from the city shard");

  const listingPublic = await getPublic(env, "listings/apartamento-centro-123.json");
  assert.ok(listingPublic, "listings/{slug}.json must still exist — §64, never a silent 404");
  assert.equal(listingPublic.status, "suspended");
});

test("reactivating a broker restores the card for a listing that was only suspended because of the broker", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env, { status: "active" });
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));
  await publishListing(env, draft.listingId);

  await suspendBroker(env, broker.brokerId);
  await republishBrokerListings(env, broker.brokerId);

  await reactivateBroker(env, broker.brokerId);
  await republishBrokerListings(env, broker.brokerId);

  const shard = await getPublic(env, "cities/londrina/001.json");
  assert.equal(shard.length, 1);
  assert.equal(shard[0].id, draft.listingId);

  const listingPublic = await getPublic(env, "listings/apartamento-centro-123.json");
  assert.equal(listingPublic.status, "active");
});

test("a listing that was independently sold before the broker got suspended keeps status \"sold\", not \"suspended\"", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env, { status: "active" });
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));
  await publishListing(env, draft.listingId);
  await updateListing(env, broker.brokerId, draft.listingId, { status: "sold" });
  await publishListing(env, draft.listingId);

  await suspendBroker(env, broker.brokerId);
  const results = await republishBrokerListings(env, broker.brokerId);
  assert.equal(results[0].listingPublic.status, "sold");
});

// --- rebuild (§33) e rebuildListing/alias -----------------------------------

test("rebuildListing is an alias for publishListing at single-listing granularity", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, baseListingInput({ status: "active" }));
  const result = await rebuildListing(env, draft.listingId);
  assert.equal(result.published, true);
  assert.equal(result.cardActive, true);
});

test("rebuildCity reconstructs the same shard/index/manifest state as incremental publishing, from private state alone", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const active1 = await createListing(env, broker.brokerId, baseListingInput({ slug: "ativo-1", status: "active" }));
  const active2 = await createListing(
    env,
    broker.brokerId,
    baseListingInput({ slug: "ativo-2", status: "active", price: 600000 }),
  );
  const wasActiveNowSold = await createListing(
    env,
    broker.brokerId,
    baseListingInput({ slug: "vendido-1", status: "active" }),
  );

  await publishListing(env, active1.listingId);
  await publishListing(env, active2.listingId);
  await publishListing(env, wasActiveNowSold.listingId);
  await updateListing(env, broker.brokerId, wasActiveNowSold.listingId, { status: "sold" });
  await publishListing(env, wasActiveNowSold.listingId);

  const shardBefore = await getPublic(env, "cities/londrina/001.json");
  const idsBefore = shardBefore.map((card) => card.id).sort();
  assert.deepEqual(idsBefore, [active1.listingId, active2.listingId].sort());

  // Simula divergência: corrompe o shard/index públicos diretamente, sem passar pelo publicador.
  await putPublic(env, "cities/londrina/001.json", []);
  await putPublic(env, "cities/londrina/index.json", []);

  const manifest = await rebuildCity(env, "londrina");

  const shardAfter = await getPublic(env, "cities/londrina/001.json");
  assert.deepEqual(shardAfter.map((card) => card.id).sort(), idsBefore);
  assert.equal(manifest.totalListings, 2);

  const index = await getPublic(env, "cities/londrina/index.json");
  assert.equal(index.length, 2);
});

// --- rebuild em lote (§34) --------------------------------------------------

test("rebuildAll processes cities in batches, checkpoints between calls, and is idempotent", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const l1 = await createListing(env, broker.brokerId, baseListingInput({ slug: "l-1", city: "londrina", status: "active" }));
  const l2 = await createListing(env, broker.brokerId, baseListingInput({ slug: "l-2", city: "sao-paulo", status: "active" }));
  const l3 = await createListing(env, broker.brokerId, baseListingInput({ slug: "l-3", city: "curitiba", status: "active" }));
  await publishListing(env, l1.listingId);
  await publishListing(env, l2.listingId);
  await publishListing(env, l3.listingId);

  const batch1 = await rebuildAll(env, { batchSize: 1 });
  assert.equal(batch1.processedCities.length, 1);
  assert.equal(batch1.done, false);
  assert.equal(batch1.totalCities, 3);

  const checkpoint = await getPrivate(env, "jobs/rebuild-all/checkpoint.json");
  assert.equal(checkpoint.cursor, 1);

  const batch2 = await rebuildAll(env, { batchSize: 1 }); // resumes from the checkpoint automatically
  assert.equal(batch2.processedCities.length, 1);
  assert.equal(batch2.done, false);

  const batch3 = await rebuildAll(env, { batchSize: 1 });
  assert.equal(batch3.done, true);
  assert.equal(await getPrivate(env, "jobs/rebuild-all/checkpoint.json"), null);

  const allProcessed = [...batch1.processedCities, ...batch2.processedCities, ...batch3.processedCities].sort();
  assert.deepEqual(allProcessed, ["curitiba", "londrina", "sao-paulo"]);

  // Idempotente: rodar de novo do zero reproduz o mesmo shard.
  const shardBefore = await getPublic(env, "cities/londrina/001.json");
  await rebuildAll(env, { batchSize: 10 });
  const shardAfter = await getPublic(env, "cities/londrina/001.json");
  assert.deepEqual(shardAfter, shardBefore);
});
