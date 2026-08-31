// modules/feeds/generator.js — quem entra/sai do feed de um submódulo
// (§46, "Modo Exportação", Etapa 9): corretor ativo + opt-in nesse
// submódulo específico (`modules.feeds[submoduleId].enabled`) + anúncio
// com projeção pública `status: "active"` — a mesma condição que já tira
// um anúncio do shard da cidade (business/publishing.js `cardActive`),
// incluindo o cascateamento de suspensão de corretor (Etapa 8a). Também
// cobre o filtro de dado incompleto (sem CEP) que o formatter vrsync
// aplica. End-to-end sobre FakeR2Bucket, sem worker/router envolvido —
// mesmo estilo de tests/publishing/publishing.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { collectFeedItems, regenerateFeeds, UnknownFeedSubmoduleError } from "../../../modules/feeds/generator.js";
import { createBroker, updateBrokerProfile, suspendBroker, reactivateBroker } from "../../../business/brokers.js";
import { createListing, updateListing } from "../../../business/listings.js";
import { publishListing, publishBroker, republishBrokerListings } from "../../../business/publishing.js";
import { getPublicText } from "../../../storage/public.js";
import { FakeR2Bucket } from "../../storage/fake-r2-bucket.js";
import { nextCpf } from "../../support/cpf.js";

const SUBMODULE = "vrsync";

// §27 hotfix (PR #19) — createBroker now requires a real CPF plus the live
// LOGIN_INDEX_SECRET to key it (storage/indexes.js).
const LOGIN_INDEX_SECRET = "test-login-index-secret-do-not-use-in-prod";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket(), IMOB_DATA: new FakeR2Bucket() };
}

async function makeOptedInBroker(env, overrides = {}) {
  const broker = await createBroker(
    env,
    {
      userId: overrides.userId ?? "user_1",
      slug: overrides.slug ?? "joao",
      name: overrides.name ?? "João Imóveis",
      plan: "premium",
      status: "active",
      cpf: overrides.cpf ?? nextCpf(),
    },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
  await publishBroker(env, broker.brokerId);
  return updateBrokerProfile(env, broker.brokerId, { modules: { feeds: { [SUBMODULE]: { enabled: true } } } });
}

function baseListingInput(overrides = {}) {
  return {
    city: "londrina",
    slug: "apartamento-centro-123",
    status: "active",
    title: "Apartamento no Centro",
    purpose: "venda",
    type: "apartamento",
    price: 450000,
    district: "Centro",
    zipcode: "86010-000",
    features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, livingArea: 95 },
    ...overrides,
  };
}

async function publishedListing(env, brokerId, overrides = {}) {
  const draft = await createListing(env, brokerId, baseListingInput(overrides));
  await publishListing(env, draft.listingId);
  return draft;
}

// --- collectFeedItems: opt-in por submódulo ---------------------------------

test("collectFeedItems excludes a broker who never enabled this submodule", async () => {
  const env = makeEnv();
  const broker = await createBroker(
    env,
    { userId: "u1", slug: "joao", name: "João", plan: "premium", status: "active", cpf: nextCpf() },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
  await publishBroker(env, broker.brokerId);
  await publishedListing(env, broker.brokerId);

  assert.equal((await collectFeedItems(env, SUBMODULE)).length, 0);
});

test("collectFeedItems excludes a broker who enabled a DIFFERENT submodule, not this one", async () => {
  const env = makeEnv();
  const broker = await createBroker(
    env,
    { userId: "u1", slug: "joao", name: "João", plan: "premium", status: "active", cpf: nextCpf() },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
  await publishBroker(env, broker.brokerId);
  await updateBrokerProfile(env, broker.brokerId, { modules: { feeds: { "outro-submodulo": { enabled: true } } } });
  await publishedListing(env, broker.brokerId);

  assert.equal((await collectFeedItems(env, SUBMODULE)).length, 0);
});

test("collectFeedItems includes an active listing from an active, opted-in broker, carrying listingId (not just slug)", async () => {
  const env = makeEnv();
  const broker = await makeOptedInBroker(env);
  const draft = await publishedListing(env, broker.brokerId);

  const items = await collectFeedItems(env, SUBMODULE);
  assert.equal(items.length, 1);
  assert.equal(items[0].listingId, draft.listingId);
  assert.equal(items[0].listing.slug, "apartamento-centro-123");
});

test("collectFeedItems excludes a listing that was never published (still draft)", async () => {
  const env = makeEnv();
  const broker = await makeOptedInBroker(env);
  await createListing(env, broker.brokerId, baseListingInput({ status: "draft" })); // never publishListing()'d live

  assert.equal((await collectFeedItems(env, SUBMODULE)).length, 0);
});

test("collectFeedItems excludes a paused/sold listing, keeping only status:active ones", async () => {
  const env = makeEnv();
  const broker = await makeOptedInBroker(env);
  await publishedListing(env, broker.brokerId, { slug: "ativo" });
  const paused = await publishedListing(env, broker.brokerId, { slug: "pausado" });
  await updateListing(env, broker.brokerId, paused.listingId, { status: "paused" });
  await publishListing(env, paused.listingId);
  const sold = await publishedListing(env, broker.brokerId, { slug: "vendido" });
  await updateListing(env, broker.brokerId, sold.listingId, { status: "sold" });
  await publishListing(env, sold.listingId);

  const items = await collectFeedItems(env, SUBMODULE);
  assert.deepEqual(items.map((item) => item.listing.slug).sort(), ["ativo"]);
});

// --- collectFeedItems: corretor suspenso (Etapa 8a) -------------------------

test("collectFeedItems drops a listing the moment its owning broker is suspended, even though the broker was opted in", async () => {
  const env = makeEnv();
  const broker = await makeOptedInBroker(env);
  await publishedListing(env, broker.brokerId);
  assert.equal((await collectFeedItems(env, SUBMODULE)).length, 1);

  await suspendBroker(env, broker.brokerId);
  await publishBroker(env, broker.brokerId);
  await republishBrokerListings(env, broker.brokerId);

  assert.equal((await collectFeedItems(env, SUBMODULE)).length, 0);
});

test("collectFeedItems brings the listing back once the broker is reactivated and republished", async () => {
  const env = makeEnv();
  const broker = await makeOptedInBroker(env);
  await publishedListing(env, broker.brokerId);

  await suspendBroker(env, broker.brokerId);
  await publishBroker(env, broker.brokerId);
  await republishBrokerListings(env, broker.brokerId);
  assert.equal((await collectFeedItems(env, SUBMODULE)).length, 0);

  await reactivateBroker(env, broker.brokerId);
  await publishBroker(env, broker.brokerId);
  await republishBrokerListings(env, broker.brokerId);
  assert.equal((await collectFeedItems(env, SUBMODULE)).length, 1);
});

test("collectFeedItems excludes listings from an opted-out broker while including an opted-in one — one file aggregates every opted-in broker", async () => {
  const env = makeEnv();
  const optedIn = await makeOptedInBroker(env, { userId: "u1", slug: "joao" });
  await publishedListing(env, optedIn.brokerId, { slug: "do-joao" });

  const optedOut = await createBroker(
    env,
    { userId: "u2", slug: "maria", name: "Maria", plan: "premium", status: "active", cpf: nextCpf() },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
  await publishBroker(env, optedOut.brokerId);
  await publishedListing(env, optedOut.brokerId, { slug: "da-maria" });

  const items = await collectFeedItems(env, SUBMODULE);
  assert.deepEqual(items.map((item) => item.listing.slug), ["do-joao"]);
});

test("collectFeedItems aggregates listings from MULTIPLE opted-in brokers into the same result set (no per-broker split)", async () => {
  const env = makeEnv();
  const brokerA = await makeOptedInBroker(env, { userId: "u1", slug: "joao" });
  await publishedListing(env, brokerA.brokerId, { slug: "do-joao" });
  const brokerB = await makeOptedInBroker(env, { userId: "u2", slug: "maria" });
  await publishedListing(env, brokerB.brokerId, { slug: "da-maria" });

  const items = await collectFeedItems(env, SUBMODULE);
  assert.deepEqual(items.map((item) => item.listing.slug).sort(), ["da-maria", "do-joao"]);
});

// --- regenerateFeeds ---------------------------------------------------------

test("regenerateFeeds writes feeds/vrsync.xml with every eligible listing", async () => {
  const env = makeEnv();
  const broker = await makeOptedInBroker(env);
  const draft = await publishedListing(env, broker.brokerId);

  const result = await regenerateFeeds(env);
  assert.deepEqual(result, { vrsync: { candidateCount: 1 } });

  const xml = await getPublicText(env, "feeds/vrsync.xml");
  assert.match(xml, new RegExp(`<ListingID>${draft.listingId}</ListingID>`));
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
});

// §46 — a listing missing zipcode counts as a "candidate" (it belongs to
// an opted-in, active broker and is published) but the vrsync formatter
// itself drops it (PostalCode is required) — documented as an
// incomplete-data pendency, not a bug: candidateCount still reflects it,
// the written XML does not.
test("regenerateFeeds's candidateCount includes a listing missing zipcode, but the written XML excludes it", async () => {
  const env = makeEnv();
  const broker = await makeOptedInBroker(env);
  await publishedListing(env, broker.brokerId, { zipcode: undefined });

  const result = await regenerateFeeds(env);
  assert.equal(result.vrsync.candidateCount, 1);

  const xml = await getPublicText(env, "feeds/vrsync.xml");
  assert.doesNotMatch(xml, /ListingID/);
});

test("regenerateFeeds overwrites the previous feed on each call (no stale listings left behind)", async () => {
  const env = makeEnv();
  const broker = await makeOptedInBroker(env);
  const listing = await publishedListing(env, broker.brokerId);
  await regenerateFeeds(env);

  await updateListing(env, broker.brokerId, listing.listingId, { status: "removed" });
  await publishListing(env, listing.listingId);
  await regenerateFeeds(env);

  const xml = await getPublicText(env, "feeds/vrsync.xml");
  assert.doesNotMatch(xml, /ListingID/);
});

test("regenerateFeeds throws UnknownFeedSubmoduleError for an unregistered submodule id", async () => {
  const env = makeEnv();
  await assert.rejects(() => regenerateFeeds(env, { submodules: ["chavesNaMao"] }), UnknownFeedSubmoduleError);
});
