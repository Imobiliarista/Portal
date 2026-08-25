// Unit tests for modules/plans/eligibility.js (§52, Etapa 10) — "does this
// broker's plan grant module X?" Nothing calls these functions in
// production yet (decision deliberately deferred — see the file's own
// header), but the logic exists and had zero coverage.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isModuleEnabledForBroker, getEnabledModulesForBroker } from "../../../modules/plans/eligibility.js";
import { createPlan, assignBrokerPlan } from "../../../business/plans.js";
import { createBroker } from "../../../business/brokers.js";
import { FakeR2Bucket } from "../../storage/fake-r2-bucket.js";
import { nextCpf } from "../../support/cpf.js";

const LOGIN_INDEX_SECRET = "test-login-index-secret-do-not-use-in-prod";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket() };
}

async function makeBrokerWithModules(env, modules) {
  await createPlan(env, { planId: "custom", name: "Custom", maxGalleryItems: 50, modules });
  const broker = await createBroker(
    env,
    { userId: "user_1", slug: "joao", name: "João", plan: "custom", cpf: nextCpf() },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
  await assignBrokerPlan(env, broker.brokerId, "custom");
  return broker;
}

test("isModuleEnabledForBroker is true when the broker's plan grants that module", async () => {
  const env = makeEnv();
  const broker = await makeBrokerWithModules(env, { publications: true, feeds: false });
  assert.equal(await isModuleEnabledForBroker(env, broker.brokerId, "publications"), true);
  assert.equal(await isModuleEnabledForBroker(env, broker.brokerId, "feeds"), false);
});

test("isModuleEnabledForBroker is false for an unknown module key — never throws", async () => {
  const env = makeEnv();
  const broker = await makeBrokerWithModules(env, { publications: true });
  assert.equal(await isModuleEnabledForBroker(env, broker.brokerId, "not-a-real-module"), false);
});

test("isModuleEnabledForBroker falls back to the default plan (no modules granted) for a broker with no plan assigned", async () => {
  const env = makeEnv();
  const broker = await createBroker(
    env,
    { userId: "user_1", slug: "joao", name: "João", plan: "does-not-exist", cpf: nextCpf() },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
  assert.equal(await isModuleEnabledForBroker(env, broker.brokerId, "publications"), false);
});

test("getEnabledModulesForBroker returns only the subset of PLAN_MODULE_KEYS granted by the plan", async () => {
  const env = makeEnv();
  const broker = await makeBrokerWithModules(env, { publications: true, feeds: false });
  assert.deepEqual(await getEnabledModulesForBroker(env, broker.brokerId), ["publications"]);
});

test("getEnabledModulesForBroker returns [] for a plan with no modules map", async () => {
  const env = makeEnv();
  await createPlan(env, { planId: "bare", name: "Bare", maxGalleryItems: 10 });
  const broker = await createBroker(
    env,
    { userId: "user_1", slug: "joao", name: "João", plan: "bare", cpf: nextCpf() },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
  await assignBrokerPlan(env, broker.brokerId, "bare");
  assert.deepEqual(await getEnabledModulesForBroker(env, broker.brokerId), []);
});
