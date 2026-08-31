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
  deleteBroker,
  listBrokers,
  BrokerNotFoundError,
  BrokerConflictError,
} from "../../business/brokers.js";
import { ValidationError } from "../../core/validation.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";
import { nextCpf } from "../support/cpf.js";

// §27 hotfix (PR #19) — createBroker now requires a real CPF (the login
// identifier) and, whenever cpf/email is set, the live LOGIN_INDEX_SECRET
// to key their private indexes (storage/indexes.js).
const LOGIN_INDEX_SECRET = "test-login-index-secret-do-not-use-in-prod";

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
    cpf: nextCpf(),
    ...overrides,
  };
}

test("createBroker persists a profile matching broker.schema.json's required shape", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });

  assert.equal(broker.schemaVersion, 1);
  assert.match(broker.brokerId, /^broker_/);
  assert.equal(broker.userId, "user_000789");
  assert.equal(broker.slug, "joao");
  assert.equal(broker.status, "pending");
  assert.equal(broker.plan, "premium");
  assert.equal(broker.name, "João Imóveis");
  assert.ok(broker.updatedAt);
});

// --- gestão completa de cliente/site: ID sequencial de 6 dígitos ----------

test("newBrokerId (via createBroker) mints a sequential 6-digit id, prefixed and zero-padded, never repeating", async () => {
  const env = makeEnv();
  const a = await createBroker(env, baseInput({ userId: "user_1" }), { loginIndexSecret: LOGIN_INDEX_SECRET });
  const b = await createBroker(env, baseInput({ slug: "maria", userId: "user_2", email: "maria@x.net" }), {
    loginIndexSecret: LOGIN_INDEX_SECRET,
  });

  assert.equal(a.brokerId, "broker_000001");
  assert.equal(b.brokerId, "broker_000002");
});

test("createBroker derives userId from the minted brokerId when userId is omitted — same number serves as client id and site id", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ userId: undefined }), { loginIndexSecret: LOGIN_INDEX_SECRET });

  assert.equal(broker.brokerId, "broker_000001");
  assert.equal(broker.userId, "user_000001");
});

// --- gestão completa de cliente/site: novos campos privados (cliente) ----

test("createBroker accepts fullName/birthDate/nationality/personalAddress", async () => {
  const env = makeEnv();
  const broker = await createBroker(
    env,
    baseInput({
      fullName: "João da Silva",
      birthDate: "1990-05-20",
      nationality: "brasileira",
      personalAddress: {
        country: "Brasil",
        state: "PR",
        city: "Londrina",
        street: "Rua das Flores",
        streetNumber: "100",
        complement: "Apto 12",
        zipcode: "86000-000",
      },
    }),
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );

  assert.equal(broker.fullName, "João da Silva");
  assert.equal(broker.birthDate, "1990-05-20");
  assert.equal(broker.nationality, "brasileira");
  assert.deepEqual(broker.personalAddress, {
    country: "Brasil",
    state: "PR",
    city: "Londrina",
    street: "Rua das Flores",
    streetNumber: "100",
    complement: "Apto 12",
    zipcode: "86000-000",
  });
});

test("createBroker rejects a birthDate in the future", async () => {
  const env = makeEnv();
  const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString().slice(0, 10);
  await assert.rejects(
    () => createBroker(env, baseInput({ birthDate: futureDate }), { loginIndexSecret: LOGIN_INDEX_SECRET }),
    ValidationError,
  );
});

test("createBroker rejects a malformed birthDate", async () => {
  const env = makeEnv();
  await assert.rejects(
    () => createBroker(env, baseInput({ birthDate: "20/05/1990" }), { loginIndexSecret: LOGIN_INDEX_SECRET }),
    ValidationError,
  );
});

test("createBroker rejects an incomplete personalAddress (missing required subfield)", async () => {
  const env = makeEnv();
  await assert.rejects(
    () =>
      createBroker(
        env,
        baseInput({ personalAddress: { country: "Brasil", state: "PR", city: "Londrina", street: "Rua X" } }),
        { loginIndexSecret: LOGIN_INDEX_SECRET },
      ),
    ValidationError,
  );
});

// --- gestão completa de cliente/site: novos campos públicos (site) -------

test("createBroker accepts businessPhone/businessEmail/businessAddress", async () => {
  const env = makeEnv();
  const broker = await createBroker(
    env,
    baseInput({
      businessPhone: "4333224455",
      businessEmail: "contato@joaoimoveis.com.br",
      businessAddress: {
        country: "Brasil",
        state: "PR",
        city: "Londrina",
        street: "Av. Comercial",
        streetNumber: "500",
        zipcode: "86010-000",
      },
    }),
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );

  assert.equal(broker.businessPhone, "4333224455");
  assert.equal(broker.businessEmail, "contato@joaoimoveis.com.br");
  assert.equal(broker.businessAddress.street, "Av. Comercial");
});

test("createBroker rejects an invalid businessEmail", async () => {
  const env = makeEnv();
  await assert.rejects(
    () => createBroker(env, baseInput({ businessEmail: "not-an-email" }), { loginIndexSecret: LOGIN_INDEX_SECRET }),
    ValidationError,
  );
});

test("updateBrokerProfile updates the new private/public fields", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });

  const updated = await updateBrokerProfile(env, broker.brokerId, {
    fullName: "João Atualizado da Silva",
    nationality: "Brasileira",
    businessPhone: "4333221100",
    businessEmail: "novo-contato@joaoimoveis.com.br",
  });

  assert.equal(updated.fullName, "João Atualizado da Silva");
  assert.equal(updated.nationality, "Brasileira");
  assert.equal(updated.businessPhone, "4333221100");
  assert.equal(updated.businessEmail, "novo-contato@joaoimoveis.com.br");
});

test("createBroker writes a separate manifest object (§29) alongside the profile draft", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });

  const manifestRaw = await env.IMOB_PRIVATE.get(`brokers/${broker.brokerId}/manifest.json`);
  const manifest = await manifestRaw.json();
  assert.equal(manifest.brokerId, broker.brokerId);
  assert.equal(manifest.slug, "joao");
  assert.equal(manifest.publicationVersion, 0);
  assert.equal(manifest.profileKey, `brokers/${broker.brokerId}/profile-draft.json`);
});

test("createBroker registers the broker in the slug and email indexes", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });

  assert.deepEqual(await getBrokerBySlug(env, "joao"), broker);
  assert.deepEqual(await getBrokerByEmail(env, "JOAO@imobiliarista.net", LOGIN_INDEX_SECRET), broker);
});

test("createBroker rejects a duplicate slug", async () => {
  const env = makeEnv();
  await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });
  await assert.rejects(
    () =>
      createBroker(env, baseInput({ userId: "user_2", email: "outro@imobiliarista.net" }), {
        loginIndexSecret: LOGIN_INDEX_SECRET,
      }),
    BrokerConflictError,
  );
});

test("createBroker rejects a duplicate email", async () => {
  const env = makeEnv();
  await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });
  await assert.rejects(
    () =>
      createBroker(env, baseInput({ slug: "maria", userId: "user_2" }), {
        loginIndexSecret: LOGIN_INDEX_SECRET,
      }),
    BrokerConflictError,
  );
});

test("createBroker rejects missing required fields", async () => {
  const env = makeEnv();
  await assert.rejects(() => createBroker(env, { slug: "joao" }), ValidationError);
});

test("createBroker accepts an explicit status but rejects an invalid enum value", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ status: "active" }), {
    loginIndexSecret: LOGIN_INDEX_SECRET,
  });
  assert.equal(broker.status, "active");
  await assert.rejects(
    () =>
      createBroker(env, baseInput({ slug: "outro", email: "outro@x.net", status: "not-a-status" }), {
        loginIndexSecret: LOGIN_INDEX_SECRET,
      }),
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
  const broker = await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });
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
  const broker = await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });

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
  const broker = await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });

  await updateBrokerProfile(
    env,
    broker.brokerId,
    { email: "novo@imobiliarista.net" },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );

  assert.equal(await getBrokerByEmail(env, "joao@imobiliarista.net", LOGIN_INDEX_SECRET), null);
  const bySlug = await getBrokerBySlug(env, "joao");
  assert.equal(bySlug.email, "novo@imobiliarista.net");
});

test("updateBrokerProfile rejects an email already used by another broker", async () => {
  const env = makeEnv();
  await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });
  const other = await createBroker(env, baseInput({ slug: "maria", userId: "user_2", email: "maria@x.net" }), {
    loginIndexSecret: LOGIN_INDEX_SECRET,
  });

  await assert.rejects(
    () =>
      updateBrokerProfile(
        env,
        other.brokerId,
        { email: "joao@imobiliarista.net" },
        { loginIndexSecret: LOGIN_INDEX_SECRET },
      ),
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
  const broker = await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });
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
  const broker = await createBroker(env, baseInput({ status: "active" }), { loginIndexSecret: LOGIN_INDEX_SECRET });
  await assert.rejects(() => approveBroker(env, broker.brokerId), BrokerConflictError);
});

test("approveBroker throws BrokerNotFoundError for an unknown brokerId", async () => {
  const env = makeEnv();
  await assert.rejects(() => approveBroker(env, "broker_ghost"), BrokerNotFoundError);
});

test("suspendBroker moves an active broker to suspended", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ status: "active" }), { loginIndexSecret: LOGIN_INDEX_SECRET });

  const suspended = await suspendBroker(env, broker.brokerId);
  assert.equal(suspended.status, "suspended");
  assert.equal((await getBrokerById(env, broker.brokerId)).status, "suspended");
});

test("suspendBroker also accepts a still-pending broker (blocking an obviously fraudulent cadastro before approval)", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });
  assert.equal(broker.status, "pending");

  const suspended = await suspendBroker(env, broker.brokerId);
  assert.equal(suspended.status, "suspended");
});

test("suspendBroker rejects a broker that's already suspended", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ status: "active" }), { loginIndexSecret: LOGIN_INDEX_SECRET });
  await suspendBroker(env, broker.brokerId);
  await assert.rejects(() => suspendBroker(env, broker.brokerId), BrokerConflictError);
});

test("reactivateBroker moves a suspended broker back to active", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ status: "active" }), { loginIndexSecret: LOGIN_INDEX_SECRET });
  await suspendBroker(env, broker.brokerId);

  const reactivated = await reactivateBroker(env, broker.brokerId);
  assert.equal(reactivated.status, "active");
});

test("reactivateBroker rejects a broker that isn't suspended", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ status: "active" }), { loginIndexSecret: LOGIN_INDEX_SECRET });
  await assert.rejects(() => reactivateBroker(env, broker.brokerId), BrokerConflictError);
});

// --- gestão completa de cliente/site: exclusão lógica ("deleted") --------

test("deleteBroker moves an active broker to deleted (logical delete only — never touches the stored record besides status/updatedAt)", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ status: "active" }), { loginIndexSecret: LOGIN_INDEX_SECRET });

  const deleted = await deleteBroker(env, broker.brokerId);
  assert.equal(deleted.status, "deleted");
  assert.equal(deleted.brokerId, broker.brokerId);
  assert.equal(deleted.slug, broker.slug);

  // Ainda recuperável por id/slug — nada foi apagado, só o status mudou.
  assert.equal((await getBrokerById(env, broker.brokerId)).status, "deleted");
  assert.equal((await getBrokerBySlug(env, broker.slug)).status, "deleted");
});

test("deleteBroker also accepts a pending or suspended broker", async () => {
  const env = makeEnv();
  const pending = await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });
  assert.equal((await deleteBroker(env, pending.brokerId)).status, "deleted");

  const suspendedBroker = await createBroker(
    env,
    baseInput({ slug: "maria", userId: "user_2", email: "maria@x.net", status: "active" }),
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
  await suspendBroker(env, suspendedBroker.brokerId);
  assert.equal((await deleteBroker(env, suspendedBroker.brokerId)).status, "deleted");
});

test("deleteBroker is terminal — rejects a broker that's already deleted (no undelete)", async () => {
  const env = makeEnv();
  const broker = await createBroker(env, baseInput({ status: "active" }), { loginIndexSecret: LOGIN_INDEX_SECRET });
  await deleteBroker(env, broker.brokerId);
  await assert.rejects(() => deleteBroker(env, broker.brokerId), BrokerConflictError);
});

test("deleteBroker throws BrokerNotFoundError for an unknown brokerId", async () => {
  const env = makeEnv();
  await assert.rejects(() => deleteBroker(env, "broker_ghost"), BrokerNotFoundError);
});

test("a deleted brokerId is never reused by a later createBroker call (sequential counter never goes backwards)", async () => {
  const env = makeEnv();
  const a = await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });
  await deleteBroker(env, a.brokerId);

  const b = await createBroker(env, baseInput({ slug: "maria", userId: "user_2", email: "maria@x.net" }), {
    loginIndexSecret: LOGIN_INDEX_SECRET,
  });
  assert.notEqual(b.brokerId, a.brokerId);
});

// --- SuperAdmin: lista de corretores (§53, Etapa 8) -----------------------

test("listBrokers returns every known broker regardless of status, via the broker registry (no bucket scan)", async () => {
  const env = makeEnv();
  const a = await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });
  const b = await createBroker(env, baseInput({ slug: "maria", userId: "user_2", email: "maria@x.net", status: "active" }), {
    loginIndexSecret: LOGIN_INDEX_SECRET,
  });

  const all = await listBrokers(env);
  assert.equal(all.length, 2);
  assert.deepEqual(
    all.map((broker) => broker.brokerId).sort(),
    [a.brokerId, b.brokerId].sort(),
  );
});

test("listBrokers filters by status when given", async () => {
  const env = makeEnv();
  await createBroker(env, baseInput(), { loginIndexSecret: LOGIN_INDEX_SECRET });
  const active = await createBroker(env, baseInput({ slug: "maria", userId: "user_2", email: "maria@x.net", status: "active" }), {
    loginIndexSecret: LOGIN_INDEX_SECRET,
  });

  const pendingOnly = await listBrokers(env, { status: "pending" });
  assert.equal(pendingOnly.length, 1);

  const activeOnly = await listBrokers(env, { status: "active" });
  assert.deepEqual(activeOnly.map((broker) => broker.brokerId), [active.brokerId]);
});
