// End-to-end wiring for /api/me/financial/* (§51, §54, Etapa 10). Mirrors
// tests/security/painel-api.test.js: handlers called directly (not
// through core/router.js) against a FakeR2Bucket-backed env and a real
// session cookie minted by a real login — same PBKDF2/HMAC auth fixture
// reused across the sub-lote 1 hotfix (PR #19), never a parallel login
// flow. `fetch` is mocked so no real Asaas call ever happens.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCreateCheckout, handleListMyCharges, handleGetMyCharge } from "../../worker/financial.js";
import { login, setAuthPassword } from "../../business/auth.js";
import { createBroker } from "../../business/brokers.js";
import { createPlan, assignBrokerPlan } from "../../business/plans.js";
import { deriveClientPbkdf2 } from "../../core/auth.js";
import { SESSION_COOKIE_NAME } from "../../core/session.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";
import { nextCpf } from "../support/cpf.js";

const SESSION_SECRET = "test-session-secret-do-not-use-in-prod";
const PASSWORD_PEPPER = "test-pepper-do-not-use-in-prod";
const LOGIN_INDEX_SECRET = "test-login-index-secret-do-not-use-in-prod";
const SECRETS = { sessionSecret: SESSION_SECRET, pepper: PASSWORD_PEPPER, loginIndexSecret: LOGIN_INDEX_SECRET };
const ORIGIN = "https://painel.imobiliarista.net";

function makeEnv(overrides = {}) {
  return {
    IMOB_PRIVATE: new FakeR2Bucket(),
    SESSION_SECRET,
    FINANCIAL_ENABLED: "true",
    ASAAS_API_KEY: "sandbox-key-123",
    ...overrides,
  };
}

async function makeBrokerSession(env, overrides = {}) {
  await createPlan(env, {
    planId: overrides.planId ?? "pro",
    name: "Pro",
    maxGalleryItems: 50,
    setupPrice: overrides.setupPrice ?? 100,
    monthlyPrice: overrides.monthlyPrice ?? 50,
  }).catch(() => {}); // idempotent across calls within the same test

  const broker = await createBroker(
    env,
    {
      userId: overrides.userId ?? "user_000789",
      slug: overrides.slug ?? "joao",
      name: overrides.name ?? "João Imóveis",
      plan: overrides.planId ?? "pro",
      email: overrides.email ?? "joao@example.com",
      cpf: overrides.cpf ?? nextCpf(),
    },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
  await assignBrokerPlan(env, broker.brokerId, overrides.planId ?? "pro");

  const authRecord = await setAuthPassword(env, broker.userId, overrides.password ?? "correct horse battery staple", {
    pepper: PASSWORD_PEPPER,
  });
  const pbkdf2Result = await deriveClientPbkdf2(
    overrides.password ?? "correct horse battery staple",
    authRecord.pbkdf2Salt,
    authRecord.pbkdf2Iterations,
  );
  const { token } = await login(env, { identifier: broker.cpf, pbkdf2Result }, SECRETS);
  return { broker, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

function req(path, { method = "GET", cookie, body } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function mockFetchSequence(responses) {
  const previousFetch = globalThis.fetch;
  let index = 0;
  globalThis.fetch = async () => {
    const responseInit = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(JSON.stringify(responseInit.body ?? {}), { status: responseInit.status ?? 200 });
  };
  return {
    restore: () => {
      globalThis.fetch = previousFetch;
    },
  };
}

test("POST /api/me/financial/checkout creates a checkout charge scoped to the caller's own brokerId", async () => {
  const env = makeEnv();
  const { broker, cookie } = await makeBrokerSession(env);
  const mock = mockFetchSequence([{ body: { id: "cus_1" } }, { body: { id: "pay_1" } }]);
  try {
    const response = await handleCreateCheckout(
      req("/api/me/financial/checkout", { method: "POST", cookie, body: { kind: "setup" } }),
      env,
    );
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.data.brokerId, broker.brokerId);
    assert.equal(body.data.kind, "setup");
  } finally {
    mock.restore();
  }
});

test("POST /api/me/financial/checkout without a session is rejected", async () => {
  const env = makeEnv();
  await assert.rejects(() =>
    handleCreateCheckout(req("/api/me/financial/checkout", { method: "POST", body: { kind: "setup" } }), env),
  );
});

test("POST /api/me/financial/checkout ignores a smuggled brokerId in the body — always the session's own broker", async () => {
  const env = makeEnv();
  const { broker, cookie } = await makeBrokerSession(env);
  const mock = mockFetchSequence([{ body: { id: "cus_1" } }, { body: { id: "pay_1" } }]);
  try {
    const response = await handleCreateCheckout(
      req("/api/me/financial/checkout", {
        method: "POST",
        cookie,
        body: { kind: "monthly", brokerId: "broker_attacker" },
      }),
      env,
    );
    const body = await response.json();
    assert.equal(body.data.brokerId, broker.brokerId);
  } finally {
    mock.restore();
  }
});

test("POST /api/me/financial/checkout returns 409 (conflict) when the plan has nothing to charge for that kind", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env, { planId: "free-ish", setupPrice: 0, monthlyPrice: 0 });
  const response = await handleCreateCheckout(
    req("/api/me/financial/checkout", { method: "POST", cookie, body: { kind: "setup" } }),
    env,
  );
  assert.equal(response.status, 409);
});

test("POST /api/me/financial/checkout returns 503 while the financial module is disabled", async () => {
  const env = makeEnv({ FINANCIAL_ENABLED: "false" });
  const { cookie } = await makeBrokerSession(env);
  const response = await handleCreateCheckout(
    req("/api/me/financial/checkout", { method: "POST", cookie, body: { kind: "setup" } }),
    env,
  );
  assert.equal(response.status, 503);
});

test("GET /api/me/financial/charges only ever lists the caller's own charges", async () => {
  const env = makeEnv();
  const { cookie: cookieA } = await makeBrokerSession(env, { userId: "user_a", slug: "joao", email: "joao@example.com" });
  const { cookie: cookieB } = await makeBrokerSession(env, { userId: "user_b", slug: "maria", email: "maria@example.com" });

  const mock = mockFetchSequence([{ body: { id: "cus_a" } }, { body: { id: "pay_a" } }]);
  try {
    await handleCreateCheckout(req("/api/me/financial/checkout", { method: "POST", cookie: cookieA, body: { kind: "setup" } }), env);
  } finally {
    mock.restore();
  }

  const responseB = await handleListMyCharges(req("/api/me/financial/charges", { cookie: cookieB }), env);
  const bodyB = await responseB.json();
  assert.deepEqual(bodyB.data, []);

  const responseA = await handleListMyCharges(req("/api/me/financial/charges", { cookie: cookieA }), env);
  const bodyA = await responseA.json();
  assert.equal(bodyA.data.length, 1);
});

test("GET /api/me/financial/charges/:id on another broker's charge returns 404, not the charge (§55)", async () => {
  const env = makeEnv();
  const { cookie: cookieA } = await makeBrokerSession(env, { userId: "user_a", slug: "joao", email: "joao@example.com" });
  const { cookie: cookieB } = await makeBrokerSession(env, { userId: "user_b", slug: "maria", email: "maria@example.com" });

  const mock = mockFetchSequence([{ body: { id: "cus_a" } }, { body: { id: "pay_a" } }]);
  let chargeA;
  try {
    const created = await handleCreateCheckout(
      req("/api/me/financial/checkout", { method: "POST", cookie: cookieA, body: { kind: "setup" } }),
      env,
    );
    chargeA = (await created.json()).data;
  } finally {
    mock.restore();
  }

  const response = await handleGetMyCharge(
    req(`/api/me/financial/charges/${chargeA.chargeId}`, { cookie: cookieB }),
    env,
    null,
    { id: chargeA.chargeId },
  );
  assert.equal(response.status, 404);
});
