import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPlan,
  updatePlan,
  getPlanById,
  listPlans,
  deletePlan,
  assignBrokerPlan,
  getGalleryLimitForBroker,
  DEFAULT_PLAN_ID,
  PlanNotFoundError,
  PlanConflictError,
} from "../../business/plans.js";
import { createBroker, getBrokerById, BrokerNotFoundError } from "../../business/brokers.js";
import { ValidationError } from "../../core/validation.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket() };
}

// --- CRUD (§52, §53) -------------------------------------------------------

test("createPlan persists a plan matching plan.schema.json's required shape", async () => {
  const env = makeEnv();
  const plan = await createPlan(env, { planId: "premium", name: "Premium", maxGalleryItems: 100 });

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.planId, "premium");
  assert.equal(plan.name, "Premium");
  assert.equal(plan.maxGalleryItems, 100);
  assert.ok(plan.updatedAt);
});

test("createPlan rejects a duplicate planId", async () => {
  const env = makeEnv();
  await createPlan(env, { planId: "premium", name: "Premium", maxGalleryItems: 100 });
  await assert.rejects(
    () => createPlan(env, { planId: "premium", name: "Outro nome", maxGalleryItems: 10 }),
    PlanConflictError,
  );
});

test("createPlan rejects missing required fields and a non-positive limit", async () => {
  const env = makeEnv();
  await assert.rejects(() => createPlan(env, { planId: "premium" }), ValidationError);
  await assert.rejects(
    () => createPlan(env, { planId: "premium", name: "Premium", maxGalleryItems: 0 }),
    ValidationError,
  );
});

test("getPlanById returns null for an unknown plan", async () => {
  const env = makeEnv();
  assert.equal(await getPlanById(env, "ghost"), null);
});

test("listPlans returns every known plan via the plan registry (no bucket scan)", async () => {
  const env = makeEnv();
  await createPlan(env, { planId: "premium", name: "Premium", maxGalleryItems: 100 });
  await createPlan(env, { planId: "basico", name: "Básico", maxGalleryItems: 20 });

  const all = await listPlans(env);
  assert.deepEqual(
    all.map((p) => p.planId).sort(),
    ["basico", "premium"],
  );
});

test("updatePlan changes name/maxGalleryItems but keeps planId immutable", async () => {
  const env = makeEnv();
  await createPlan(env, { planId: "premium", name: "Premium", maxGalleryItems: 100 });

  const updated = await updatePlan(env, "premium", { name: "Premium Plus", maxGalleryItems: 150, planId: "hijacked" });
  assert.equal(updated.planId, "premium");
  assert.equal(updated.name, "Premium Plus");
  assert.equal(updated.maxGalleryItems, 150);
});

test("updatePlan throws PlanNotFoundError for an unknown planId", async () => {
  const env = makeEnv();
  await assert.rejects(() => updatePlan(env, "ghost", { name: "x" }), PlanNotFoundError);
});

test("deletePlan removes a plan not assigned to any broker", async () => {
  const env = makeEnv();
  await createPlan(env, { planId: "premium", name: "Premium", maxGalleryItems: 100 });

  await deletePlan(env, "premium");
  assert.equal(await getPlanById(env, "premium"), null);
  assert.deepEqual(await listPlans(env), []);
});

test("deletePlan refuses to remove the default plan, even before it's ever been seeded", async () => {
  const env = makeEnv();
  await assert.rejects(() => deletePlan(env, DEFAULT_PLAN_ID), PlanConflictError);
});

test("deletePlan refuses to remove a plan currently assigned to a broker", async () => {
  const env = makeEnv();
  await createPlan(env, { planId: "premium", name: "Premium", maxGalleryItems: 100 });
  const broker = await createBroker(env, {
    userId: "user_1",
    slug: "joao",
    name: "João",
    plan: "premium",
    email: "joao@imobiliarista.net",
  });
  await assignBrokerPlan(env, broker.brokerId, "premium");

  await assert.rejects(() => deletePlan(env, "premium"), PlanConflictError);
});

test("deletePlan throws PlanNotFoundError for an unknown planId", async () => {
  const env = makeEnv();
  await assert.rejects(() => deletePlan(env, "ghost"), PlanNotFoundError);
});

// --- atribuição de plano a corretor (§53) ----------------------------------

test("assignBrokerPlan sets the broker's plan and mirrors it onto the manifest", async () => {
  const env = makeEnv();
  await createPlan(env, { planId: "premium", name: "Premium", maxGalleryItems: 100 });
  const broker = await createBroker(env, {
    userId: "user_1",
    slug: "joao",
    name: "João",
    plan: "algum-texto-livre-antigo",
    email: "joao@imobiliarista.net",
  });

  const updated = await assignBrokerPlan(env, broker.brokerId, "premium");
  assert.equal(updated.plan, "premium");
  assert.equal((await getBrokerById(env, broker.brokerId)).plan, "premium");

  const manifestRaw = await env.IMOB_PRIVATE.get(`brokers/${broker.brokerId}/manifest.json`);
  const manifest = await manifestRaw.json();
  assert.equal(manifest.plan, "premium");
});

test("assignBrokerPlan throws PlanNotFoundError for an unknown planId", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, {
    userId: "user_1",
    slug: "joao",
    name: "João",
    plan: "free",
    email: "joao@imobiliarista.net",
  });
  await assert.rejects(() => assignBrokerPlan(env, broker.brokerId, "ghost"), PlanNotFoundError);
});

test("assignBrokerPlan throws BrokerNotFoundError for an unknown brokerId", async () => {
  const env = makeEnv();
  await createPlan(env, { planId: "premium", name: "Premium", maxGalleryItems: 100 });
  await assert.rejects(() => assignBrokerPlan(env, "broker_ghost", "premium"), BrokerNotFoundError);
});

// --- limite de fotos derivado do plano (§56-57, substitui PROVISIONAL_MAX_GALLERY_ITEMS) ---

test("getGalleryLimitForBroker seeds and returns the default plan's limit when the broker has no real record", async () => {
  const env = makeEnv();
  const limit = await getGalleryLimitForBroker(env, "broker_never_created");
  assert.equal(limit, 50);

  const seeded = await getPlanById(env, DEFAULT_PLAN_ID);
  assert.ok(seeded, "default plan should have been seeded on first use");
  assert.equal(seeded.maxGalleryItems, 50);
});

test("getGalleryLimitForBroker returns the broker's actually assigned plan limit", async () => {
  const env = makeEnv();
  await createPlan(env, { planId: "premium", name: "Premium", maxGalleryItems: 200 });
  const broker = await createBroker(env, {
    userId: "user_1",
    slug: "joao",
    name: "João",
    plan: "premium",
    email: "joao@imobiliarista.net",
  });

  assert.equal(await getGalleryLimitForBroker(env, broker.brokerId), 200);
});

test("getGalleryLimitForBroker falls back to the default plan when the broker's assigned planId no longer exists", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, {
    userId: "user_1",
    slug: "joao",
    name: "João",
    plan: "um-plano-que-nunca-foi-criado",
    email: "joao@imobiliarista.net",
  });

  assert.equal(await getGalleryLimitForBroker(env, broker.brokerId), 50);
});
