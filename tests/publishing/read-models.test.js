// business/publishing.js#publishPortalCatalogs / resolveKnownCitiesForCatalog
// (§65-§66, Etapa 3) — the piece that was missing entirely before this fix:
// `portal/cities.json`/`taxonomy.json`/`modules.json` never had a writer,
// which is the confirmed root cause of https://imobiliarista.net's infinite
// "Carregando…" (GET .../portal/cities.json always 404'd). Same
// FakeR2Bucket-backed env pattern as tests/publishing/publishing.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { publishPortalCatalogs, resolveKnownCitiesForCatalog, publishListing } from "../../business/publishing.js";
import { createBroker } from "../../business/brokers.js";
import { createListing } from "../../business/listings.js";
import { getPublic, putPublic } from "../../storage/public.js";
import { registerCitySlug } from "../../storage/indexes.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";
import { nextCpf } from "../support/cpf.js";

const LOGIN_INDEX_SECRET = "test-login-index-secret-do-not-use-in-prod";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket(), IMOB_DATA: new FakeR2Bucket() };
}

async function makeBroker(env, overrides = {}) {
  return createBroker(
    env,
    {
      userId: overrides.userId ?? "user_1",
      slug: overrides.slug ?? "joao",
      name: overrides.name ?? "João Imóveis",
      plan: "premium",
      status: overrides.status ?? "active",
      creci: overrides.creci ?? "12345-F",
      cpf: overrides.cpf ?? nextCpf(),
    },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
}

// --- estado vazio (Etapa 3 requisito obrigatório) --------------------------

test("publishPortalCatalogs on a completely empty IMOB_PRIVATE still publishes all 3 catalogs, valid and empty", async () => {
  const env = makeEnv();
  const result = await publishPortalCatalogs(env);

  assert.equal(result.citiesPublished, 0);
  assert.deepEqual(result.skippedCitySlugs, []);

  const cities = await getPublic(env, "portal/cities.json");
  assert.deepEqual(cities, { schemaVersion: 1, cities: [] });
  assert.notEqual(cities, null); // §200, never a 404 for the empty state

  const taxonomy = await getPublic(env, "portal/taxonomy.json");
  assert.equal(taxonomy.schemaVersion, 1);
  assert.ok(taxonomy.types.length > 0);

  const modules = await getPublic(env, "portal/modules.json");
  assert.equal(modules.schemaVersion, 1);
  assert.ok(modules.modules.length > 0);
});

// --- estado com dados reais -------------------------------------------------

test("publishPortalCatalogs reflects a published listing's city with the correct totalListings", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, {
    city: "londrina",
    slug: "apartamento-centro-1",
    title: "Apartamento no Centro",
    purpose: "venda",
    type: "apartamento",
    price: 450000,
    district: "Centro",
    features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, livingArea: 95 },
    status: "active",
  });
  await publishListing(env, draft.listingId);

  const result = await publishPortalCatalogs(env);
  assert.equal(result.citiesPublished, 1);

  const cities = await getPublic(env, "portal/cities.json");
  assert.equal(cities.cities.length, 1);
  assert.equal(cities.cities[0].slug, "londrina");
  assert.equal(cities.cities[0].uf, "PR");
  assert.equal(cities.cities[0].totalListings, 1);
});

// --- cidade registrada mas sem manifest ainda (defensivo) -------------------

test("resolveKnownCitiesForCatalog defaults totalListings to 0 for a registered city with no manifest yet", async () => {
  const env = makeEnv();
  await registerCitySlug(env, "londrina");

  const { cities, skippedCitySlugs } = await resolveKnownCitiesForCatalog(env);
  assert.equal(cities.length, 1);
  assert.equal(cities[0].totalListings, 0);
  assert.deepEqual(skippedCitySlugs, []);
});

test("resolveKnownCitiesForCatalog skips (never throws for) a city slug outside the IBGE catalog", async () => {
  const env = makeEnv();
  await registerCitySlug(env, "cidade-inexistente-no-ibge");

  const { cities, skippedCitySlugs } = await resolveKnownCitiesForCatalog(env);
  assert.deepEqual(cities, []);
  assert.deepEqual(skippedCitySlugs, ["cidade-inexistente-no-ibge"]);
});

// --- idempotência ------------------------------------------------------

test("publishPortalCatalogs run twice with unchanged private state writes byte-identical content", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, {
    city: "londrina",
    slug: "apartamento-centro-2",
    title: "Apartamento no Centro",
    purpose: "venda",
    type: "apartamento",
    price: 450000,
    district: "Centro",
    features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, livingArea: 95 },
    status: "active",
  });
  await publishListing(env, draft.listingId);

  await publishPortalCatalogs(env);
  const first = await getPublic(env, "portal/cities.json");
  await publishPortalCatalogs(env);
  const second = await getPublic(env, "portal/cities.json");

  assert.deepEqual(first, second);
});

// --- nunca projeta campos privados ------------------------------------------

test("published portal/cities.json never leaks private broker/listing fields", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const draft = await createListing(env, broker.brokerId, {
    city: "londrina",
    slug: "apartamento-centro-3",
    title: "Apartamento no Centro",
    purpose: "venda",
    type: "apartamento",
    price: 450000,
    district: "Centro",
    features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, livingArea: 95 },
    status: "active",
  });
  await publishListing(env, draft.listingId);
  await publishPortalCatalogs(env);

  const cities = await getPublic(env, "portal/cities.json");
  const serialized = JSON.stringify(cities);
  assert.ok(!serialized.includes(broker.brokerId));
  assert.ok(!serialized.includes(draft.listingId));
});
