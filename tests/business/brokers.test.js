import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBroker,
  updateBrokerProfile,
  getBrokerById,
  getBrokerBySlug,
  getBrokerByEmail,
  approveBroker,
  suspendBroker,
  reactivateBroker,
  listBrokers,
  BrokerNotFoundError,
  BrokerConflictError,
} from "../../business/brokers.js";
import { ValidationError } from "../../core/validation.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket() };
}

function baseInput(overrides = {}) {
  return {
    userId: "user_000789",
    slug: "joao",
    name: "João Imóveis",
    plan: "premium",
    email: "joao@imobiliarista.net",
    ...overrides,
  };
}

test("createBroker persists a profile matching broker.schema.json's required shape", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput());

  assert.equal(broker.schemaVersion, 1);
  assert.match(broker.brokerId, /^broker_/);
  assert.equal(broker.userId, "user_000789");
  assert.equal(broker.slug, "joao");
  assert.equal(broker.status, "pending");
  assert.equal(broker.plan, "premium");
  assert.equal(broker.name, "João Imóveis");
  assert.ok(broker.updatedAt);
});

test("createBroker writes a separate manifest object (§29) alongside the profile draft", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput());

  const manifestRaw = await env.IMOB_PRIVATE.get(`brokers/${broker.brokerId}/manifest.json`);
  const manifest = await manifestRaw.json();
  assert.equal(manifest.brokerId, broker.brokerId);
  assert.equal(manifest.slug, "joao");
  assert.equal(manifest.publicationVersion, 0);
  assert.equal(manifest.profileKey, `brokers/${broker.brokerId}/profile-draft.json`);
});

test("createBroker registers the broker in the slug and email indexes", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput());

  assert.deepEqual(await getBrokerBySlug(env, "joao"), broker);
  assert.deepEqual(await getBrokerByEmail(env, "JOAO@imobiliarista.net"), broker);
});

test("createBroker rejects a duplicate slug", async () => {
  const env = makeEnv();
  await createBroker(env, baseInput());
  await assert.rejects(
    () => createBroker(env, baseInput({ userId: "user_2", email: "outro@imobiliarista.net" })),
    BrokerConflictError,
  );
});

test("createBroker rejects a duplicate email", async () => {
  const env = makeEnv();
  await createBroker(env, baseInput());
  await assert.rejects(
    () => createBroker(env, baseInput({ slug: "maria", userId: "user_2" })),
    BrokerConflictError,
  );
});

test("createBroker rejects missing required fields", async () => {
  const env = makeEnv();
  await assert.rejects(() => createBroker(env, { slug: "joao" }), ValidationError);
});

test("createBroker accepts an explicit status but rejects an invalid enum value", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ status: "active" }));
  assert.equal(broker.status, "active");
  await assert.rejects(
    () => createBroker(env, baseInput({ slug: "outro", email: "outro@x.net", status: "not-a-status" })),
    ValidationError,
  );
});

test("getBrokerById returns null for an unknown id", async () => {
  const env = makeEnv();
  assert.equal(await getBrokerById(env, "broker_never"), null);
});

test("getBrokerBySlug returns null when the slug belongs to a listing, not a broker", async () => {
  const env = makeEnv();
  const { setSlugIndex } = await import("../../storage/indexes.js");
  await setSlugIndex(env, "apartamento-1", "listing", "listing_1");
  assert.equal(await getBrokerBySlug(env, "apartamento-1"), null);
});

test("updateBrokerProfile updates only allowlisted fields and bumps updatedAt", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput());
  const before = broker.updatedAt;

  const updated = await updateBrokerProfile(env, broker.brokerId, {
    about: "Especialista em Londrina.",
    phone: "43999990000",
  });

  assert.equal(updated.about, "Especialista em Londrina.");
  assert.equal(updated.phone, "43999990000");
  assert.equal(updated.name, broker.name);
  assert.ok(new Date(updated.updatedAt).getTime() >= new Date(before).getTime());
});

test("updateBrokerProfile never lets the patch override brokerId, userId, slug, status or plan (§55)", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput());

  const updated = await updateBrokerProfile(env, broker.brokerId, {
    brokerId: "broker_someone_else",
    userId: "user_someone_else",
    slug: "hijacked-slug",
    status: "active",
    plan: "free",
    name: "Nome Atualizado",
  });

  assert.equal(updated.brokerId, broker.brokerId);
  assert.equal(updated.userId, broker.userId);
  assert.equal(updated.slug, broker.slug);
  assert.equal(updated.status, broker.status);
  assert.equal(updated.plan, broker.plan);
  assert.equal(updated.name, "Nome Atualizado");
});

test("updateBrokerProfile moves the email index and frees the old address", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput());

  await updateBrokerProfile(env, broker.brokerId, { email: "novo@imobiliarista.net" });

  assert.equal(await getBrokerByEmail(env, "joao@imobiliarista.net"), null);
  const bySlug = await getBrokerBySlug(env, "joao");
  assert.equal(bySlug.email, "novo@imobiliarista.net");
});

test("updateBrokerProfile rejects an email already used by another broker", async () => {
  const env = makeEnv();
  await createBroker(env, baseInput());
  const other = await createBroker(env, baseInput({ slug: "maria", userId: "user_2", email: "maria@x.net" }));

  await assert.rejects(
    () => updateBrokerProfile(env, other.brokerId, { email: "joao@imobiliarista.net" }),
    BrokerConflictError,
  );
});

test("updateBrokerProfile throws BrokerNotFoundError for an unknown brokerId", async () => {
  const env = makeEnv();
  await assert.rejects(() => updateBrokerProfile(env, "broker_ghost", { name: "x" }), BrokerNotFoundError);
});

test("updateBrokerProfile requires an explicit brokerId argument", async () => {
  const env = makeEnv();
  await assert.rejects(() => updateBrokerProfile(env, "", { name: "x" }), ValidationError);
});

// --- SuperAdmin: aprovação/suspensão/reativação (§53, Etapa 8) ------------

test("approveBroker moves a pending broker to active and refreshes updatedAt", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput());
  assert.equal(broker.status, "pending");

  const approved = await approveBroker(env, broker.brokerId);
  assert.equal(approved.status, "active");
  // Millisecond-resolution ISO timestamp — same-millisecond execution can
  // produce an identical string, so this only checks it never goes
  // backwards, not strict inequality (avoids a flaky test).
  assert.ok(approved.updatedAt >= broker.updatedAt);

  const manifestRaw = await env.IMOB_PRIVATE.get(`brokers/${broker.brokerId}/manifest.json`);
  const manifest = await manifestRaw.json();
  assert.equal(manifest.status, "active");
});

test("approveBroker rejects a broker that isn't pending", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ status: "active" }));
  await assert.rejects(() => approveBroker(env, broker.brokerId), BrokerConflictError);
});

test("approveBroker throws BrokerNotFoundError for an unknown brokerId", async () => {
  const env = makeEnv();
  await assert.rejects(() => approveBroker(env, "broker_ghost"), BrokerNotFoundError);
});

test("suspendBroker moves an active broker to suspended", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ status: "active" }));

  const suspended = await suspendBroker(env, broker.brokerId);
  assert.equal(suspended.status, "suspended");
  assert.equal((await getBrokerById(env, broker.brokerId)).status, "suspended");
});

test("suspendBroker also accepts a still-pending broker (blocking an obviously fraudulent cadastro before approval)", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput());
  assert.equal(broker.status, "pending");

  const suspended = await suspendBroker(env, broker.brokerId);
  assert.equal(suspended.status, "suspended");
});

test("suspendBroker rejects a broker that's already suspended", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ status: "active" }));
  await suspendBroker(env, broker.brokerId);
  await assert.rejects(() => suspendBroker(env, broker.brokerId), BrokerConflictError);
});

test("reactivateBroker moves a suspended broker back to active", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ status: "active" }));
  await suspendBroker(env, broker.brokerId);

  const reactivated = await reactivateBroker(env, broker.brokerId);
  assert.equal(reactivated.status, "active");
});

test("reactivateBroker rejects a broker that isn't suspended", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ status: "active" }));
  await assert.rejects(() => reactivateBroker(env, broker.brokerId), BrokerConflictError);
});

// --- SuperAdmin: lista de corretores (§53, Etapa 8) -----------------------

test("listBrokers returns every known broker regardless of status, via the broker registry (no bucket scan)", async () => {
  const env = makeEnv();
  const a = await createBroker(env, baseInput());
  const b = await createBroker(env, baseInput({ slug: "maria", userId: "user_2", email: "maria@x.net", status: "active" }));

  const all = await listBrokers(env);
  assert.equal(all.length, 2);
  assert.deepEqual(
    all.map((broker) => broker.brokerId).sort(),
    [a.brokerId, b.brokerId].sort(),
  );
});

test("listBrokers filters by status when given", async () => {
  const env = makeEnv();
  await createBroker(env, baseInput());
  const active = await createBroker(env, baseInput({ slug: "maria", userId: "user_2", email: "maria@x.net", status: "active" }));

  const pendingOnly = await listBrokers(env, { status: "pending" });
  assert.equal(pendingOnly.length, 1);

  const activeOnly = await listBrokers(env, { status: "active" });
  assert.deepEqual(activeOnly.map((broker) => broker.brokerId), [active.brokerId]);
});
