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
  handleApproveBroker,
  handleSuspendBroker,
  handleReactivateBroker,
  handlePublishBroker,
  handleRebuildCity,
  handleRebuildAll,
} from "../../worker/admin.js";
import { handleCreateListing } from "../../worker/api.js";
import { login, setAuthPassword } from "../../business/auth.js";
import { createBroker, getBrokerById } from "../../business/brokers.js";
import { SESSION_COOKIE_NAME } from "../../core/session.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";

const SECRET = "test-secret-do-not-use-in-prod";
const ORIGIN = "https://admin.imobiliarista.net";

function makeEnv() {
  return {
    IMOB_PRIVATE: new FakeR2Bucket(),
    IMOB_DATA: new FakeR2Bucket(),
    SESSION_SECRET: SECRET,
  };
}

async function makeBrokerSession(env, overrides = {}) {
  const broker = await createBroker(env, {
    userId: overrides.userId ?? "user_000789",
    slug: overrides.slug ?? "joao",
    name: overrides.name ?? "João Imóveis",
    plan: "premium",
    status: overrides.status ?? "pending",
    email: overrides.email ?? "joao@imobiliarista.net",
  });
  await setAuthPassword(env, broker.userId, overrides.password ?? "correct horse battery staple");
  const { token } = await login(
    env,
    { email: overrides.email ?? "joao@imobiliarista.net", password: overrides.password ?? "correct horse battery staple" },
    SECRET,
  );
  return { broker, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

async function makeSuperadminSession(env, overrides = {}) {
  const broker = await createBroker(env, {
    userId: overrides.userId ?? "user_admin",
    slug: overrides.slug ?? "admin",
    name: overrides.name ?? "Admin",
    plan: overrides.plan ?? "internal",
    status: "active",
    email: overrides.email ?? "admin@imobiliarista.net",
  });
  await setAuthPassword(env, broker.userId, overrides.password ?? "correct horse battery staple", { role: "superadmin" });
  const { token } = await login(
    env,
    { email: overrides.email ?? "admin@imobiliarista.net", password: overrides.password ?? "correct horse battery staple" },
    SECRET,
  );
  return { broker, cookie: `${SESSION_COOKIE_NAME}=${token}` };
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
        features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, area: 95 },
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
        features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, area: 95 },
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
