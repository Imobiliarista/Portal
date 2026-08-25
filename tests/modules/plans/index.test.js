// modules/plans/{catalog,index,features}.js are thin re-export layers over
// business/plans.js (§52, Etapa 10) — no independent logic, but nothing
// else in the suite imports through them, so a broken re-export path
// (e.g. a typo in the relative import) would go unnoticed otherwise.

import { test } from "node:test";
import assert from "node:assert/strict";
import { listPlans, getPlanById, getPlanForBroker, DEFAULT_PLAN_ID, PLAN_MODULE_KEYS, PLAN_FEATURES } from "../../../modules/plans/index.js";
import * as catalog from "../../../modules/plans/catalog.js";
import { createPlan } from "../../../business/plans.js";
import { FakeR2Bucket } from "../../storage/fake-r2-bucket.js";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket() };
}

test("modules/plans/index.js re-exports catalog.js's read functions and they work end-to-end", async () => {
  const env = makeEnv();
  await createPlan(env, { planId: "pro", name: "Pro", maxGalleryItems: 100 });

  assert.deepEqual(await catalog.getPlanById(env, "pro"), await getPlanById(env, "pro"));
  const plans = await listPlans(env);
  assert.ok(plans.some((p) => p.planId === "pro"));

  const resolved = await getPlanForBroker(env, "broker_without_a_plan");
  assert.equal(resolved.planId, DEFAULT_PLAN_ID);
});

test("PLAN_FEATURES (modules/plans/features.js) stays in sync with PLAN_MODULE_KEYS", () => {
  assert.deepEqual(
    PLAN_FEATURES.map((f) => f.key),
    PLAN_MODULE_KEYS,
  );
  for (const feature of PLAN_FEATURES) {
    assert.equal(typeof feature.label, "string");
    assert.ok(feature.label.length > 0);
  }
});
