import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loginIdentifierHash,
  resolveLogin,
  setLoginIndex,
  resolveSlug,
  setSlugIndex,
  resolveBrokerByEmail,
  setBrokerEmailIndex,
  deleteBrokerEmailIndex,
  getBrokerListingIds,
  addBrokerListingId,
  removeBrokerListingId,
  getKnownPlanIds,
  registerPlanId,
  deregisterPlanId,
} from "../../storage/indexes.js";
import { FakeR2Bucket } from "./fake-r2-bucket.js";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket() };
}

test("loginIdentifierHash normalizes case and is deterministic", async () => {
  const a = await loginIdentifierHash("Joao@Imobiliarista.net");
  const b = await loginIdentifierHash("joao@imobiliarista.net");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("login index resolves without ever scanning the bucket (§26)", async () => {
  const env = makeEnv();
  await setLoginIndex(env, "joao@imobiliarista.net", "user_000789");
  const resolved = await resolveLogin(env, "JOAO@imobiliarista.net");
  assert.deepEqual(resolved, { userId: "user_000789" });
});

test("resolveLogin returns null for an unknown identifier", async () => {
  const env = makeEnv();
  assert.equal(await resolveLogin(env, "ninguem@imobiliarista.net"), null);
});

test("slug index stores type alongside id so brokers and listings can share one prefix", async () => {
  const env = makeEnv();
  await setSlugIndex(env, "joao", "broker", "broker_000123");
  await setSlugIndex(env, "apartamento-centro-123", "listing", "listing_000456");

  assert.deepEqual(await resolveSlug(env, "joao"), { type: "broker", id: "broker_000123" });
  assert.deepEqual(await resolveSlug(env, "apartamento-centro-123"), {
    type: "listing",
    id: "listing_000456",
  });
});

test("broker email index resolves case-insensitively and is distinct from the login index", async () => {
  const env = makeEnv();
  await setBrokerEmailIndex(env, "Joao@Imobiliarista.net", "broker_000123");

  assert.deepEqual(await resolveBrokerByEmail(env, "joao@imobiliarista.net"), {
    brokerId: "broker_000123",
  });
  assert.equal(await resolveLogin(env, "joao@imobiliarista.net"), null);
});

test("resolveBrokerByEmail returns null for an unknown email", async () => {
  const env = makeEnv();
  assert.equal(await resolveBrokerByEmail(env, "ninguem@imobiliarista.net"), null);
});

test("deleteBrokerEmailIndex removes the mapping", async () => {
  const env = makeEnv();
  await setBrokerEmailIndex(env, "joao@imobiliarista.net", "broker_000123");
  await deleteBrokerEmailIndex(env, "joao@imobiliarista.net");
  assert.equal(await resolveBrokerByEmail(env, "joao@imobiliarista.net"), null);
});

test("broker listing index add/remove stays deduplicated", async () => {
  const env = makeEnv();
  await addBrokerListingId(env, "broker_1", "listing_1");
  await addBrokerListingId(env, "broker_1", "listing_2");
  await addBrokerListingId(env, "broker_1", "listing_1"); // duplicate, no-op

  assert.deepEqual(await getBrokerListingIds(env, "broker_1"), ["listing_1", "listing_2"]);

  await removeBrokerListingId(env, "broker_1", "listing_1");
  assert.deepEqual(await getBrokerListingIds(env, "broker_1"), ["listing_2"]);
});

test("getBrokerListingIds returns an empty array for a broker with no index yet", async () => {
  const env = makeEnv();
  assert.deepEqual(await getBrokerListingIds(env, "broker_never_published"), []);
});

// --- plan registry (Etapa 8b, §52/§53) ------------------------------------

test("plan registry add/dedupe/remove", async () => {
  const env = makeEnv();
  await registerPlanId(env, "premium");
  await registerPlanId(env, "basico");
  await registerPlanId(env, "premium"); // duplicate, no-op

  assert.deepEqual(await getKnownPlanIds(env), ["basico", "premium"]);

  await deregisterPlanId(env, "premium");
  assert.deepEqual(await getKnownPlanIds(env), ["basico"]);
});

test("getKnownPlanIds returns an empty array when no plan was ever registered", async () => {
  const env = makeEnv();
  assert.deepEqual(await getKnownPlanIds(env), []);
});
