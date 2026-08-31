// End-to-end wiring for /api/admin/* (§72, §53, Etapa 8). Mirrors
// tests/security/painel-api.test.js/auth-flow.test.js: handlers are called
// directly (not through core/router.js) against a FakeR2Bucket-backed env
// and real session cookies minted by a real login, so this exercises the
// same chain a live /api/admin/* request goes through — including the
// `requireSuperadmin` gate this lot is the first to actually wire into a
// route.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleListBrokers,
  handleCreateBroker,
  handleGetBroker,
  handleUpdateBroker,
  handleApproveBroker,
  handleSuspendBroker,
  handleReactivateBroker,
  handleDeleteBroker,
  handlePublishBroker,
  handleRebuildCity,
  handleRebuildAll,
  handleListPlans,
  handleCreatePlan,
  handleGetPlan,
  handleUpdatePlan,
  handleDeletePlan,
  handleAssignBrokerPlan,
} from "../../worker/admin.js";
import { handleCreateListing } from "../../worker/api.js";
import { login, setAuthPassword, getAuthUser } from "../../business/auth.js";
import { createBroker, getBrokerById } from "../../business/brokers.js";
import { deriveClientPbkdf2, PBKDF2_ITERATIONS } from "../../core/auth.js";
import { SESSION_COOKIE_NAME } from "../../core/session.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";
import { nextCpf } from "../support/cpf.js";

const SESSION_SECRET = "test-session-secret-do-not-use-in-prod";
const PASSWORD_PEPPER = "test-pepper-do-not-use-in-prod";
const LOGIN_INDEX_SECRET = "test-login-index-secret-do-not-use-in-prod";
const SECRETS = { sessionSecret: SESSION_SECRET, pepper: PASSWORD_PEPPER, loginIndexSecret: LOGIN_INDEX_SECRET };
const ORIGIN = "https://admin.imobiliarista.net";

function makeEnv() {
  return {
    IMOB_PRIVATE: new FakeR2Bucket(),
    IMOB_DATA: new FakeR2Bucket(),
    SESSION_SECRET,
    PASSWORD_PEPPER,
    LOGIN_INDEX_SECRET,
  };
}

// Gestão completa de cliente/site: `POST /api/admin/brokers` never accepts
// a plaintext password — it wants the same `{ salt, pbkdf2Result }` shape
// the browser derives locally before `POST /api/auth/login` (§27 hotfix).
// A fixed salt is fine here (tests aren't reusing it across real accounts).
async function deriveInitialCredentials(password) {
  const salt = "dGVzdC1zYWx0LTE2Ynl0ZXM="; // base64, arbitrary fixed test salt
  const pbkdf2Result = await deriveClientPbkdf2(password, salt, PBKDF2_ITERATIONS);
  return { salt, pbkdf2Result };
}

// §27 hotfix (PR #19) — CPF + browser-side PBKDF2 replaced e-mail+password;
// mint a real session the same way the browser would (deriveClientPbkdf2
// against the record's real salt), never by faking claims directly.
async function makeSession(env, { userId, slug, name, plan, status, cpf, password, role }) {
  const broker = await createBroker(
    env,
    { userId, slug, name, plan, status, cpf: cpf ?? nextCpf() },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
  const authRecord = await setAuthPassword(env, broker.userId, password ?? "correct horse battery staple", {
    pepper: PASSWORD_PEPPER,
    ...(role ? { role } : {}),
  });
  const pbkdf2Result = await deriveClientPbkdf2(
    password ?? "correct horse battery staple",
    authRecord.pbkdf2Salt,
    authRecord.pbkdf2Iterations,
  );
  const { token } = await login(env, { identifier: broker.cpf, pbkdf2Result }, SECRETS);
  return { broker, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

async function makeBrokerSession(env, overrides = {}) {
  return makeSession(env, {
    userId: overrides.userId ?? "user_000789",
    slug: overrides.slug ?? "joao",
    name: overrides.name ?? "João Imóveis",
    plan: "premium",
    status: overrides.status ?? "pending",
    cpf: overrides.cpf,
    password: overrides.password,
  });
}

async function makeSuperadminSession(env, overrides = {}) {
  return makeSession(env, {
    userId: overrides.userId ?? "user_admin",
    slug: overrides.slug ?? "admin",
    name: overrides.name ?? "Admin",
    plan: overrides.plan ?? "internal",
    status: "active",
    cpf: overrides.cpf,
    password: overrides.password,
    role: "superadmin",
  });
}

function req(path, { method = "GET", cookie, body, headers = {} } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// --- gate: só superadmin ------------------------------------------------------

test("GET /api/admin/brokers without a session returns 401", async () => {
  const env = makeEnv();
  await assert.rejects(() => handleListBrokers(req("/api/admin/brokers"), env));
});

test("GET /api/admin/brokers with a broker (non-superadmin) session is forbidden", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env);
  await assert.rejects(() => handleListBrokers(req("/api/admin/brokers", { cookie }), env));
});

test("GET /api/admin/brokers with a superadmin session lists every broker", async () => {
  const env = makeEnv();
  await makeBrokerSession(env, { userId: "user_a", slug: "joao", email: "joao@imobiliarista.net" });
  await makeBrokerSession(env, { userId: "user_b", slug: "maria", email: "maria@imobiliarista.net" });
  const { cookie } = await makeSuperadminSession(env);

  const response = await handleListBrokers(req("/api/admin/brokers", { cookie }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  // 2 brokers created via makeBrokerSession + the superadmin's own broker record
  assert.equal(body.data.length, 3);
});

test("GET /api/admin/brokers?status=pending filters", async () => {
  const env = makeEnv();
  await makeBrokerSession(env, { userId: "user_a", slug: "joao", email: "joao@imobiliarista.net", status: "pending" });
  const { cookie } = await makeSuperadminSession(env);

  const response = await handleListBrokers(req("/api/admin/brokers?status=pending", { cookie }), env);
  const body = await response.json();
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].slug, "joao");
});

// --- gestão completa de cliente/site: criar/ver/editar/excluir ------------

function fullBrokerFields(overrides = {}) {
  return {
    slug: "novocliente",
    name: "Novo Cliente Imóveis",
    plan: "premium",
    cpf: nextCpf(),
    fullName: "Fulano de Tal",
    birthDate: "1985-03-10",
    nationality: "brasileira",
    email: "fulano-privado@example.com",
    phone: "43999990000",
    personalAddress: {
      country: "Brasil",
      state: "PR",
      city: "Londrina",
      street: "Rua Pessoal",
      streetNumber: "10",
      zipcode: "86000-000",
    },
    creci: "54321-F",
    whatsapp: "43988887777",
    city: "Londrina",
    businessPhone: "4333224455",
    businessEmail: "contato@novocliente.com.br",
    businessAddress: {
      country: "Brasil",
      state: "PR",
      city: "Londrina",
      street: "Av. Comercial",
      streetNumber: "500",
      zipcode: "86010-000",
    },
    ...overrides,
  };
}

test("POST /api/admin/brokers requires a superadmin session", async () => {
  const env = makeEnv();
  const { salt, pbkdf2Result } = await deriveInitialCredentials("correct horse battery staple");
  await assert.rejects(() =>
    handleCreateBroker(req("/api/admin/brokers", { method: "POST", body: { ...fullBrokerFields(), salt, pbkdf2Result } }), env),
  );
});

test("POST /api/admin/brokers rejects a body without salt/pbkdf2Result — never accepts a plaintext password", async () => {
  const env = makeEnv();
  const { cookie } = await makeSuperadminSession(env);

  const response = await handleCreateBroker(
    req("/api/admin/brokers", { method: "POST", cookie, body: { ...fullBrokerFields(), password: "correct horse battery staple" } }),
    env,
  );
  assert.equal(response.status, 400);
});

test("POST /api/admin/brokers creates a client/site with all private+public fields and an initial password the account can log in with", async () => {
  const env = makeEnv();
  const { cookie } = await makeSuperadminSession(env);
  const cpf = nextCpf();
  const { salt, pbkdf2Result } = await deriveInitialCredentials("correct horse battery staple");

  const response = await handleCreateBroker(
    req("/api/admin/brokers", { method: "POST", cookie, body: { ...fullBrokerFields({ cpf }), salt, pbkdf2Result } }),
    env,
  );
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.data.brokerId, /^broker_\d{6}$/);
  assert.equal(body.data.fullName, "Fulano de Tal");
  assert.equal(body.data.businessEmail, "contato@novocliente.com.br");

  // A senha inicial derivada no navegador realmente autentica a conta.
  const loginPbkdf2Result = await deriveClientPbkdf2("correct horse battery staple", salt, PBKDF2_ITERATIONS);
  const { claims } = await login(env, { identifier: cpf, pbkdf2Result: loginPbkdf2Result }, SECRETS);
  assert.equal(claims.brokerId, body.data.brokerId);
});

test("GET /api/admin/brokers/:id requires a superadmin session", async () => {
  const env = makeEnv();
  const { broker, cookie: brokerCookie } = await makeBrokerSession(env);
  await assert.rejects(() =>
    handleGetBroker(req(`/api/admin/brokers/${broker.brokerId}`, { cookie: brokerCookie }), env, null, { id: broker.brokerId }),
  );
});

test("GET /api/admin/brokers/:id returns the full private+public record (SuperAdmin has full access)", async () => {
  const env = makeEnv();
  const { broker } = await makeBrokerSession(env);
  const { cookie } = await makeSuperadminSession(env);

  const response = await handleGetBroker(req(`/api/admin/brokers/${broker.brokerId}`, { cookie }), env, null, { id: broker.brokerId });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.brokerId, broker.brokerId);
  assert.equal(body.data.cpf, broker.cpf);
});

test("GET /api/admin/brokers/:id returns 404 for an unknown brokerId", async () => {
  const env = makeEnv();
  const { cookie } = await makeSuperadminSession(env);
  const response = await handleGetBroker(req("/api/admin/brokers/broker_ghost", { cookie }), env, null, { id: "broker_ghost" });
  assert.equal(response.status, 404);
});

test("PUT /api/admin/brokers/:id requires a superadmin session", async () => {
  const env = makeEnv();
  const { broker, cookie: brokerCookie } = await makeBrokerSession(env);
  await assert.rejects(() =>
    handleUpdateBroker(req(`/api/admin/brokers/${broker.brokerId}`, { method: "PUT", cookie: brokerCookie, body: { name: "x" } }), env, null, {
      id: broker.brokerId,
    }),
  );
});

test("PUT /api/admin/brokers/:id edits the new private/public fields and ignores anything not allowlisted", async () => {
  const env = makeEnv();
  const { broker } = await makeBrokerSession(env);
  const { cookie } = await makeSuperadminSession(env);

  const response = await handleUpdateBroker(
    req(`/api/admin/brokers/${broker.brokerId}`, {
      method: "PUT",
      cookie,
      body: {
        fullName: "Nome Legal Atualizado",
        businessPhone: "4333229900",
        status: "active", // não está no allowlist de update — deve ser ignorado
        brokerId: "broker_someone_else",
      },
    }),
    env,
    null,
    { id: broker.brokerId },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.fullName, "Nome Legal Atualizado");
  assert.equal(body.data.businessPhone, "4333229900");
  assert.equal(body.data.status, "pending"); // status inalterado
  assert.equal(body.data.brokerId, broker.brokerId);
});

test("POST /api/admin/brokers/:id/delete requires a superadmin session", async () => {
  const env = makeEnv();
  const { broker, cookie: brokerCookie } = await makeBrokerSession(env, { status: "active" });
  await assert.rejects(() =>
    handleDeleteBroker(req(`/api/admin/brokers/${broker.brokerId}/delete`, { method: "POST", cookie: brokerCookie }), env, null, {
      id: broker.brokerId,
    }),
  );
});

test("POST /api/admin/brokers/:id/delete marks the broker deleted, produces the same minimal public status a suspended broker gets, and never deletes any object", async () => {
  const env = makeEnv();
  const { broker, cookie: brokerCookie } = await makeBrokerSession(env, { status: "active" });
  await handleCreateListing(
    req("/api/me/listings", {
      method: "POST",
      cookie: brokerCookie,
      body: {
        city: "londrina",
        slug: "apartamento-centro-123",
        title: "Apartamento no Centro",
        purpose: "venda",
        type: "apartamento",
        price: 450000,
        district: "Centro",
        status: "active",
        features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, livingArea: 95 },
      },
    }),
    env,
  );

  const { cookie } = await makeSuperadminSession(env);
  const response = await handleDeleteBroker(req(`/api/admin/brokers/${broker.brokerId}/delete`, { method: "POST", cookie }), env, null, {
    id: broker.brokerId,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.status, "deleted");

  // O registro privado continua existindo (exclusão é lógica, nunca física).
  assert.equal((await getBrokerById(env, broker.brokerId)).status, "deleted");

  // O site vira a mesma publicação mínima que um corretor suspenso já tem.
  const publicProfile = await env.IMOB_DATA.get("brokers/joao/profile.json");
  assert.ok(publicProfile, "a deleted broker's minisite must still resolve (§64), not 404");
  const publicProfileBody = await publicProfile.json();
  assert.equal(publicProfileBody.status, "suspended");

  const shardRaw = await env.IMOB_DATA.get("cities/londrina/001.json");
  const shard = await shardRaw.json();
  assert.equal(shard.length, 0, "the deleted broker's card must be gone from the city shard");
});

test("POST /api/admin/brokers/:id/delete on an already-deleted broker returns 409 (terminal, no undelete)", async () => {
  const env = makeEnv();
  const { broker } = await makeBrokerSession(env, { status: "active" });
  const { cookie } = await makeSuperadminSession(env);

  await handleDeleteBroker(req(`/api/admin/brokers/${broker.brokerId}/delete`, { method: "POST", cookie }), env, null, { id: broker.brokerId });
  const response = await handleDeleteBroker(req(`/api/admin/brokers/${broker.brokerId}/delete`, { method: "POST", cookie }), env, null, {
    id: broker.brokerId,
  });
  assert.equal(response.status, 409);
});

test("a deleted broker can no longer log in", async () => {
  const env = makeEnv();
  const password = "correct horse battery staple";
  const { broker } = await makeBrokerSession(env, { status: "active", password });
  const { cookie } = await makeSuperadminSession(env);

  await handleDeleteBroker(req(`/api/admin/brokers/${broker.brokerId}/delete`, { method: "POST", cookie }), env, null, { id: broker.brokerId });

  const authRecord = await getAuthUser(env, broker.userId);
  const pbkdf2Result = await deriveClientPbkdf2(password, authRecord.pbkdf2Salt, authRecord.pbkdf2Iterations);
  await assert.rejects(() => login(env, { identifier: broker.cpf, pbkdf2Result }, SECRETS));
});

// --- aprovação/suspensão/reativação (§53) -------------------------------------

test("POST /api/admin/brokers/:id/approve moves a pending broker to active and publishes its minisite", async () => {
  const env = makeEnv();
  const { broker } = await makeBrokerSession(env);
  const { cookie } = await makeSuperadminSession(env);

  const response = await handleApproveBroker(req(`/api/admin/brokers/${broker.brokerId}/approve`, { method: "POST", cookie }), env, null, {
    id: broker.brokerId,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.status, "active");

  const publicProfile = await env.IMOB_DATA.get("brokers/joao/profile.json");
  assert.ok(publicProfile, "approving should publish the broker's minisite");
});

test("POST /api/admin/brokers/:id/approve as a broker (non-superadmin) is forbidden", async () => {
  const env = makeEnv();
  const { broker, cookie } = await makeBrokerSession(env);

  await assert.rejects(() =>
    handleApproveBroker(req(`/api/admin/brokers/${broker.brokerId}/approve`, { method: "POST", cookie }), env, null, {
      id: broker.brokerId,
    }),
  );
});

test("POST /api/admin/brokers/:id/approve on an unknown brokerId returns 404", async () => {
  const env = makeEnv();
  const { cookie } = await makeSuperadminSession(env);

  const response = await handleApproveBroker(req("/api/admin/brokers/broker_ghost/approve", { method: "POST", cookie }), env, null, {
    id: "broker_ghost",
  });
  assert.equal(response.status, 404);
});

test("POST /api/admin/brokers/:id/approve on an already-active broker returns 409", async () => {
  const env = makeEnv();
  const { broker } = await makeBrokerSession(env, { status: "active" });
  const { cookie } = await makeSuperadminSession(env);

  const response = await handleApproveBroker(req(`/api/admin/brokers/${broker.brokerId}/approve`, { method: "POST", cookie }), env, null, {
    id: broker.brokerId,
  });
  assert.equal(response.status, 409);
});

test("POST /api/admin/brokers/:id/suspend pulls the broker's already-published listings' cards out of the city shard immediately (§53)", async () => {
  const env = makeEnv();
  const { broker, cookie: brokerCookie } = await makeBrokerSession(env, { status: "active" });
  await handleCreateListing(
    req("/api/me/listings", {
      method: "POST",
      cookie: brokerCookie,
      body: {
        city: "londrina",
        slug: "apartamento-centro-123",
        title: "Apartamento no Centro",
        purpose: "venda",
        type: "apartamento",
        price: 450000,
        district: "Centro",
        status: "active",
        features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, livingArea: 95 },
      },
    }),
    env,
  );

  const { cookie: adminCookie } = await makeSuperadminSession(env);
  const response = await handleSuspendBroker(
    req(`/api/admin/brokers/${broker.brokerId}/suspend`, { method: "POST", cookie: adminCookie }),
    env,
    null,
    { id: broker.brokerId },
  );
  assert.equal(response.status, 200);

  const shardRaw = await env.IMOB_DATA.get("cities/londrina/001.json");
  const shard = await shardRaw.json();
  assert.equal(shard.length, 0, "the suspended broker's card must be gone from the city shard");

  const listingPublicRaw = await env.IMOB_DATA.get("listings/apartamento-centro-123.json");
  const listingPublic = await listingPublicRaw.json();
  assert.equal(listingPublic.status, "suspended");
});

test("POST /api/admin/brokers/:id/activate reactivates a suspended broker", async () => {
  const env = makeEnv();
  const { broker } = await makeBrokerSession(env, { status: "active" });
  const { cookie } = await makeSuperadminSession(env);

  await handleSuspendBroker(req(`/api/admin/brokers/${broker.brokerId}/suspend`, { method: "POST", cookie }), env, null, {
    id: broker.brokerId,
  });

  const response = await handleReactivateBroker(
    req(`/api/admin/brokers/${broker.brokerId}/activate`, { method: "POST", cookie }),
    env,
    null,
    { id: broker.brokerId },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.status, "active");

  assert.equal((await getBrokerById(env, broker.brokerId)).status, "active");
});

test("POST /api/admin/brokers/:id/publish force-republishes the broker's profile", async () => {
  const env = makeEnv();
  const { broker } = await makeBrokerSession(env, { status: "active" });
  const { cookie } = await makeSuperadminSession(env);

  const response = await handlePublishBroker(req(`/api/admin/brokers/${broker.brokerId}/publish`, { method: "POST", cookie }), env, null, {
    id: broker.brokerId,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.broker.brokerId, broker.brokerId);
  assert.equal(body.data.republishedListings, 0);
});

// --- rebuild manual (§53, §33-34) ---------------------------------------------

test("POST /api/admin/rebuild/city/:city reconstructs the city and requires superadmin", async () => {
  const env = makeEnv();
  const { cookie: brokerCookie } = await makeBrokerSession(env, { status: "active" });
  await handleCreateListing(
    req("/api/me/listings", {
      method: "POST",
      cookie: brokerCookie,
      body: {
        city: "londrina",
        slug: "apartamento-centro-123",
        title: "Apartamento no Centro",
        purpose: "venda",
        type: "apartamento",
        price: 450000,
        district: "Centro",
        status: "active",
        features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, livingArea: 95 },
      },
    }),
    env,
  );

  await assert.rejects(() => handleRebuildCity(req("/api/admin/rebuild/city/londrina", { method: "POST" }), env, null, { city: "londrina" }));

  const { cookie } = await makeSuperadminSession(env);
  const response = await handleRebuildCity(req("/api/admin/rebuild/city/londrina", { method: "POST", cookie }), env, null, {
    city: "londrina",
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.totalListings, 1);
});

test("POST /api/admin/rebuild/city/:city for an unknown city returns 404", async () => {
  const env = makeEnv();
  const { cookie } = await makeSuperadminSession(env);

  const response = await handleRebuildCity(req("/api/admin/rebuild/city/cidade-fantasma", { method: "POST", cookie }), env, null, {
    city: "cidade-fantasma",
  });
  assert.equal(response.status, 404);
});

test("POST /api/admin/rebuild/all reaproveita business/publishing.js#rebuildAll (§34) e requer superadmin", async () => {
  const env = makeEnv();
  await assert.rejects(() => handleRebuildAll(req("/api/admin/rebuild/all", { method: "POST" }), env));

  const { cookie } = await makeSuperadminSession(env);
  const response = await handleRebuildAll(req("/api/admin/rebuild/all", { method: "POST", cookie, body: {} }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.done, true);
});

// --- planos (§52, §53, Etapa 8b) ----------------------------------------------

test("GET /api/admin/plans without a superadmin session is rejected", async () => {
  const env = makeEnv();
  await assert.rejects(() => handleListPlans(req("/api/admin/plans"), env));

  const { cookie } = await makeBrokerSession(env);
  await assert.rejects(() => handleListPlans(req("/api/admin/plans", { cookie }), env));
});

test("POST /api/admin/plans creates a plan; GET lists it", async () => {
  const env = makeEnv();
  const { cookie } = await makeSuperadminSession(env);

  const createResponse = await handleCreatePlan(
    req("/api/admin/plans", { method: "POST", cookie, body: { planId: "premium", name: "Premium", maxGalleryItems: 100 } }),
    env,
  );
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.data.planId, "premium");

  const listResponse = await handleListPlans(req("/api/admin/plans", { cookie }), env);
  const list = await listResponse.json();
  assert.equal(list.data.length, 1);
});

test("POST /api/admin/plans rejects a duplicate planId with 409", async () => {
  const env = makeEnv();
  const { cookie } = await makeSuperadminSession(env);
  const body = { planId: "premium", name: "Premium", maxGalleryItems: 100 };

  await handleCreatePlan(req("/api/admin/plans", { method: "POST", cookie, body }), env);
  const response = await handleCreatePlan(req("/api/admin/plans", { method: "POST", cookie, body }), env);
  assert.equal(response.status, 409);
});

test("GET /api/admin/plans/:id returns 404 for an unknown plan", async () => {
  const env = makeEnv();
  const { cookie } = await makeSuperadminSession(env);
  const response = await handleGetPlan(req("/api/admin/plans/ghost", { cookie }), env, null, { id: "ghost" });
  assert.equal(response.status, 404);
});

test("PUT /api/admin/plans/:id updates name/limit", async () => {
  const env = makeEnv();
  const { cookie } = await makeSuperadminSession(env);
  await handleCreatePlan(
    req("/api/admin/plans", { method: "POST", cookie, body: { planId: "premium", name: "Premium", maxGalleryItems: 100 } }),
    env,
  );

  const response = await handleUpdatePlan(
    req("/api/admin/plans/premium", { method: "PUT", cookie, body: { name: "Premium Plus", maxGalleryItems: 150 } }),
    env,
    null,
    { id: "premium" },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.name, "Premium Plus");
  assert.equal(body.data.maxGalleryItems, 150);
});

test("DELETE /api/admin/plans/:id removes a plan not in use", async () => {
  const env = makeEnv();
  const { cookie } = await makeSuperadminSession(env);
  await handleCreatePlan(
    req("/api/admin/plans", { method: "POST", cookie, body: { planId: "premium", name: "Premium", maxGalleryItems: 100 } }),
    env,
  );

  const response = await handleDeletePlan(req("/api/admin/plans/premium", { method: "DELETE", cookie }), env, null, {
    id: "premium",
  });
  assert.equal(response.status, 200);

  const getResponse = await handleGetPlan(req("/api/admin/plans/premium", { cookie }), env, null, { id: "premium" });
  assert.equal(getResponse.status, 404);
});

test("DELETE /api/admin/plans/:id refuses to remove a plan assigned to a broker", async () => {
  const env = makeEnv();
  const { cookie } = await makeSuperadminSession(env);
  await handleCreatePlan(
    req("/api/admin/plans", { method: "POST", cookie, body: { planId: "premium", name: "Premium", maxGalleryItems: 100 } }),
    env,
  );
  const { broker } = await makeBrokerSession(env);
  await handleAssignBrokerPlan(
    req(`/api/admin/brokers/${broker.brokerId}/plan`, { method: "PUT", cookie, body: { planId: "premium" } }),
    env,
    null,
    { id: broker.brokerId },
  );

  const response = await handleDeletePlan(req("/api/admin/plans/premium", { method: "DELETE", cookie }), env, null, {
    id: "premium",
  });
  assert.equal(response.status, 409);
});

test("PUT /api/admin/brokers/:id/plan assigns a plan to a broker and requires superadmin", async () => {
  const env = makeEnv();
  const { cookie } = await makeSuperadminSession(env);
  await handleCreatePlan(
    req("/api/admin/plans", { method: "POST", cookie, body: { planId: "premium", name: "Premium", maxGalleryItems: 100 } }),
    env,
  );
  const { broker, cookie: brokerCookie } = await makeBrokerSession(env);

  await assert.rejects(() =>
    handleAssignBrokerPlan(
      req(`/api/admin/brokers/${broker.brokerId}/plan`, { method: "PUT", cookie: brokerCookie, body: { planId: "premium" } }),
      env,
      null,
      { id: broker.brokerId },
    ),
  );

  const response = await handleAssignBrokerPlan(
    req(`/api/admin/brokers/${broker.brokerId}/plan`, { method: "PUT", cookie, body: { planId: "premium" } }),
    env,
    null,
    { id: broker.brokerId },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.plan, "premium");
});

test("PUT /api/admin/brokers/:id/plan returns 404 for an unknown planId", async () => {
  const env = makeEnv();
  const { cookie } = await makeSuperadminSession(env);
  const { broker } = await makeBrokerSession(env);

  const response = await handleAssignBrokerPlan(
    req(`/api/admin/brokers/${broker.brokerId}/plan`, { method: "PUT", cookie, body: { planId: "ghost" } }),
    env,
    null,
    { id: broker.brokerId },
  );
  assert.equal(response.status, 404);
});
