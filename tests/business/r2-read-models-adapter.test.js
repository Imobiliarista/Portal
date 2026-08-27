// business/r2ReadModelsAdapter.js — enumerate/validate/plan/apply/report
// pipeline (Etapa 4). All in-memory (FakeR2Bucket) — no credentials, no
// remote access, same fixture pattern as tests/publishing/publishing.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enumerate,
  validate,
  planGlobalCatalogs,
  applyGlobalCatalogsPlan,
  reconcileKnownBrokersAndCities,
  publishReadModels,
} from "../../business/r2ReadModelsAdapter.js";
import { publishListing } from "../../business/publishing.js";
import { createBroker } from "../../business/brokers.js";
import { createListing } from "../../business/listings.js";
import { registerCitySlug } from "../../storage/indexes.js";
import { getPublic } from "../../storage/public.js";
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

async function makeActiveListing(env, brokerId, overrides = {}) {
  const draft = await createListing(env, brokerId, {
    city: overrides.city ?? "londrina",
    slug: overrides.slug ?? "apartamento-centro-adapter",
    title: "Apartamento no Centro",
    purpose: "venda",
    type: "apartamento",
    price: 450000,
    district: "Centro",
    features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, area: 95 },
    status: "active",
  });
  await publishListing(env, draft.listingId);
  return draft;
}

// --- enumerate ---------------------------------------------------------

test("enumerate reads only the registries — empty on a fresh env, never scans the bucket", async () => {
  const env = makeEnv();
  const enumeration = await enumerate(env);
  assert.deepEqual(enumeration, { citySlugs: [], brokerIds: [] });
});

test("enumerate reflects known cities/brokers after real publication", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  await makeActiveListing(env, broker.brokerId);

  const enumeration = await enumerate(env);
  assert.deepEqual(enumeration.citySlugs, ["londrina"]);
  assert.deepEqual(enumeration.brokerIds, [broker.brokerId]);
});

// --- validate ------------------------------------------------------------

test("validate never throws on an empty enumeration", async () => {
  const env = makeEnv();
  const result = await validate(env, { citySlugs: [], brokerIds: [] });
  assert.equal(result.valid, true);
  assert.deepEqual(result.problems, []);
});

test("validate reports (never throws for) a city slug outside the IBGE catalog", async () => {
  const env = makeEnv();
  const result = await validate(env, { citySlugs: ["cidade-inexistente"], brokerIds: [] });
  assert.equal(result.valid, true);
  assert.deepEqual(result.unknownCitySlugs, ["cidade-inexistente"]);
  assert.ok(result.problems.length > 0);
});

test("validate reports (never throws for) a brokerId with no private profile", async () => {
  const env = makeEnv();
  const result = await validate(env, { citySlugs: [], brokerIds: ["broker_ghost"] });
  assert.deepEqual(result.missingBrokerIds, ["broker_ghost"]);
  assert.ok(result.problems.length > 0);
});

// --- plan (puro, em memória) -------------------------------------------

test("planGlobalCatalogs on an empty env plans all 3 catalogs as create", async () => {
  const env = makeEnv();
  const plan = await planGlobalCatalogs(env);
  assert.equal(plan.targets.length, 3);
  for (const target of plan.targets) {
    assert.equal(target.action, "create");
    assert.equal(target.currentValue, null);
  }
});

test("planGlobalCatalogs plans unchanged when the current object already matches the target", async () => {
  const env = makeEnv();
  const firstPlan = await planGlobalCatalogs(env);
  await applyGlobalCatalogsPlan(env, firstPlan);

  const secondPlan = await planGlobalCatalogs(env);
  for (const target of secondPlan.targets) {
    assert.equal(target.action, "unchanged");
  }
});

test("planGlobalCatalogs never writes anything — pure read-only over env", async () => {
  const env = makeEnv();
  const originalPut = env.IMOB_DATA.put.bind(env.IMOB_DATA);
  env.IMOB_DATA.put = () => {
    throw new Error("planGlobalCatalogs must never write");
  };
  await assert.doesNotReject(planGlobalCatalogs(env));
  env.IMOB_DATA.put = originalPut;
});

// --- apply -----------------------------------------------------------------

test("applyGlobalCatalogsPlan writes create targets and reports correct counts", async () => {
  const env = makeEnv();
  const plan = await planGlobalCatalogs(env);
  const report = await applyGlobalCatalogsPlan(env, plan);

  assert.equal(report.planned, 3);
  assert.equal(report.created, 3);
  assert.equal(report.updated, 0);
  assert.equal(report.unchanged, 0);
  assert.equal(report.rejected, 0);

  assert.notEqual(await getPublic(env, "portal/cities.json"), null);
  assert.notEqual(await getPublic(env, "portal/taxonomy.json"), null);
  assert.notEqual(await getPublic(env, "portal/modules.json"), null);
});

test("applyGlobalCatalogsPlan does not re-write unchanged targets (idempotent apply)", async () => {
  const env = makeEnv();
  await applyGlobalCatalogsPlan(env, await planGlobalCatalogs(env));

  let putCalls = 0;
  const originalPut = env.IMOB_DATA.put.bind(env.IMOB_DATA);
  env.IMOB_DATA.put = (...args) => {
    putCalls += 1;
    return originalPut(...args);
  };

  const report = await applyGlobalCatalogsPlan(env, await planGlobalCatalogs(env));
  assert.equal(report.unchanged, 3);
  assert.equal(putCalls, 0);
});

test("applyGlobalCatalogsPlan never calls delete — plan/apply offers no delete operation at all", async () => {
  const env = makeEnv();
  env.IMOB_DATA.delete = () => {
    throw new Error("applyGlobalCatalogsPlan must never delete");
  };
  await assert.doesNotReject(applyGlobalCatalogsPlan(env, await planGlobalCatalogs(env)));
});

test("no exported function on the adapter module is named/aliased delete/remove/purge", async () => {
  const adapter = await import("../../business/r2ReadModelsAdapter.js");
  for (const exportName of Object.keys(adapter)) {
    assert.doesNotMatch(exportName.toLowerCase(), /delete|remove|purge/);
  }
});

// --- reconciliação (reaproveita o publicador) -------------------------------

test("reconcileKnownBrokersAndCities skips an unknown city slug instead of throwing UnknownCityError", async () => {
  const env = makeEnv();
  await registerCitySlug(env, "cidade-fora-do-ibge");
  const enumeration = await enumerate(env);
  const validation = await validate(env, enumeration);

  const result = await reconcileKnownBrokersAndCities(env, enumeration, validation);
  assert.equal(result.citiesProcessed, 0);
  assert.equal(result.totalCities, 1);
});

test("reconcileKnownBrokersAndCities skips a brokerId with no private profile instead of throwing", async () => {
  const env = makeEnv();
  const enumeration = { citySlugs: [], brokerIds: ["broker_ghost"] };
  const validation = await validate(env, enumeration);

  const result = await reconcileKnownBrokersAndCities(env, enumeration, validation);
  assert.equal(result.brokersProcessed, 0);
});

// --- pipeline completo (enumerate -> validate -> reconcile -> plan -> apply) -

test("publishReadModels on a fully empty install publishes valid empty catalogs end to end", async () => {
  const env = makeEnv();
  const result = await publishReadModels(env);

  assert.equal(result.validation.valid, true);
  assert.equal(result.report.created, 3);
  assert.deepEqual(await getPublic(env, "portal/cities.json"), { schemaVersion: 1, cities: [] });
});

test("publishReadModels reflects a real listing's city totalListings after reconciliation", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  await makeActiveListing(env, broker.brokerId);

  const result = await publishReadModels(env);
  const cities = await getPublic(env, "portal/cities.json");
  assert.equal(cities.cities.length, 1);
  assert.equal(cities.cities[0].totalListings, 1);
  assert.equal(result.reconciliation.brokersProcessed, 1);
  assert.equal(result.reconciliation.citiesProcessed, 1);
});

test("publishReadModels run twice with unchanged private state is idempotent (second run: all unchanged)", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  await makeActiveListing(env, broker.brokerId);

  await publishReadModels(env);
  const second = await publishReadModels(env);

  assert.equal(second.report.created, 0);
  assert.equal(second.report.updated, 0);
  assert.equal(second.report.unchanged, 3);
});

test("publishReadModels report never contains raw CPF or secret values", async () => {
  const env = makeEnv();
  const cpf = nextCpf();
  const broker = await makeBroker(env, { cpf });
  await makeActiveListing(env, broker.brokerId);

  const result = await publishReadModels(env);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(cpf));
  assert.ok(!serialized.includes(LOGIN_INDEX_SECRET));
});

test("reconcileBrokersAndCities: false skips reconciliation entirely (used by the validate-only executor mode)", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  await makeActiveListing(env, broker.brokerId);

  const result = await publishReadModels(env, { reconcileBrokersAndCities: false });
  assert.equal(result.reconciliation, null);
  // the listing was published directly (publishListing already ran above),
  // so the city manifest still reflects it even without reconciliation.
  const cities = await getPublic(env, "portal/cities.json");
  assert.equal(cities.cities[0].totalListings, 1);
});
