// Unit tests for modules/financial/checkout.js (§51, Etapa 10) — business
// logic only, against a FakeR2Bucket-backed env, mirroring
// tests/publishing/publishing.test.js's style. `fetch` is mocked so no
// real Asaas call ever happens; provider.js's own contract (headers, URL,
// error mapping) is covered separately in provider.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createCheckoutForBroker, NothingToChargeError } from "../../../modules/financial/checkout.js";
import { FinancialModuleDisabledError } from "../../../modules/financial/provider.js";
import { createBroker } from "../../../business/brokers.js";
import { createPlan, assignBrokerPlan } from "../../../business/plans.js";
import { getPrivate } from "../../../storage/private.js";
import { privateKeys } from "../../../storage/keys.js";
import { ValidationError } from "../../../core/validation.js";
import { BrokerNotFoundError } from "../../../business/brokers.js";
import { FakeR2Bucket } from "../../storage/fake-r2-bucket.js";
import { nextCpf } from "../../support/cpf.js";

const LOGIN_INDEX_SECRET = "test-login-index-secret-do-not-use-in-prod";
const ENABLED_ENV_EXTRA = { FINANCIAL_ENABLED: "true", ASAAS_API_KEY: "sandbox-key-123" };

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket(), ...ENABLED_ENV_EXTRA };
}

function mockFetchSequence(responses) {
  const previousFetch = globalThis.fetch;
  const calls = [];
  let index = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const responseInit = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(JSON.stringify(responseInit.body ?? {}), { status: responseInit.status ?? 200 });
  };
  return {
    restore: () => {
      globalThis.fetch = previousFetch;
    },
    calls,
  };
}

async function makeBrokerWithPlan(env, { setupPrice = 100, monthlyPrice = 50, cpf } = {}) {
  await createPlan(env, { planId: "pro", name: "Pro", maxGalleryItems: 50, setupPrice, monthlyPrice });
  const broker = await createBroker(
    env,
    {
      userId: "user_1",
      slug: "joao",
      name: "João Imóveis",
      plan: "pro",
      email: "joao@example.com",
      cpf: cpf ?? nextCpf(),
    },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
  await assignBrokerPlan(env, broker.brokerId, "pro");
  return broker;
}

test("createCheckoutForBroker creates a customer + payment and persists a pending charge", async () => {
  const env = makeEnv();
  const broker = await makeBrokerWithPlan(env);
  const mock = mockFetchSequence([
    { body: { id: "cus_1" } },
    { body: { id: "pay_1", invoiceUrl: "https://sandbox.asaas.com/i/1", billingType: "UNDEFINED" } },
  ]);
  try {
    const charge = await createCheckoutForBroker(env, broker.brokerId, "setup");
    assert.equal(charge.status, "pending");
    assert.equal(charge.kind, "setup");
    assert.equal(charge.amount, 100);
    assert.equal(charge.brokerId, broker.brokerId);
    assert.equal(charge.providerCustomerId, "cus_1");
    assert.equal(charge.providerPaymentId, "pay_1");
    assert.equal(charge.invoiceUrl, "https://sandbox.asaas.com/i/1");
    assert.equal(charge.confirmedAt, null);

    const stored = await getPrivate(env, privateKeys.financialCharge(charge.chargeId));
    assert.deepEqual(stored, charge);
    assert.equal(mock.calls.length, 2, "customer, then payment");
  } finally {
    mock.restore();
  }
});

test("createCheckoutForBroker reuses the same providerCustomerId on a second checkout (no duplicate Asaas customer)", async () => {
  const env = makeEnv();
  const broker = await makeBrokerWithPlan(env);
  const mock = mockFetchSequence([
    { body: { id: "cus_1" } },
    { body: { id: "pay_1" } },
    { body: { id: "pay_2" } },
  ]);
  try {
    const first = await createCheckoutForBroker(env, broker.brokerId, "setup");
    const second = await createCheckoutForBroker(env, broker.brokerId, "monthly");
    assert.equal(first.providerCustomerId, "cus_1");
    assert.equal(second.providerCustomerId, "cus_1");
    assert.equal(mock.calls.length, 3, "customer once, payment twice — never a second POST /customers");
    assert.match(mock.calls[1].url, /\/payments$/);
    assert.match(mock.calls[2].url, /\/payments$/);
  } finally {
    mock.restore();
  }
});

test("createCheckoutForBroker throws NothingToChargeError for a plan with no price set (never calls Asaas)", async () => {
  const env = makeEnv();
  const broker = await makeBrokerWithPlan(env, { setupPrice: 0, monthlyPrice: 0 });
  const mock = mockFetchSequence([{ body: {} }]);
  try {
    await assert.rejects(() => createCheckoutForBroker(env, broker.brokerId, "monthly"), NothingToChargeError);
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("createCheckoutForBroker rejects an invalid kind before touching Asaas", async () => {
  const env = makeEnv();
  const broker = await makeBrokerWithPlan(env);
  const mock = mockFetchSequence([{ body: {} }]);
  try {
    await assert.rejects(() => createCheckoutForBroker(env, broker.brokerId, "yearly"), ValidationError);
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("createCheckoutForBroker throws BrokerNotFoundError for an unknown brokerId", async () => {
  const env = makeEnv();
  await assert.rejects(() => createCheckoutForBroker(env, "broker_ghost", "setup"), BrokerNotFoundError);
});

test("createCheckoutForBroker throws FinancialModuleDisabledError when FINANCIAL_ENABLED isn't \"true\", before any I/O", async () => {
  const env = { IMOB_PRIVATE: new FakeR2Bucket() }; // no FINANCIAL_ENABLED
  const mock = mockFetchSequence([{ body: {} }]);
  try {
    await assert.rejects(() => createCheckoutForBroker(env, "broker_x", "setup"), FinancialModuleDisabledError);
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("createCheckoutForBroker requires the broker to have a CPF before creating an Asaas customer", async () => {
  const env = makeEnv();
  await createPlan(env, { planId: "pro", name: "Pro", maxGalleryItems: 50, setupPrice: 100, monthlyPrice: 50 });
  const broker = await createBroker(
    env,
    { userId: "user_1", slug: "joao", name: "João Imóveis", plan: "pro", email: "joao@example.com" },
    { loginIndexSecret: LOGIN_INDEX_SECRET, allowMissingCpf: true },
  );
  await assignBrokerPlan(env, broker.brokerId, "pro");

  const mock = mockFetchSequence([{ body: {} }]);
  try {
    await assert.rejects(() => createCheckoutForBroker(env, broker.brokerId, "setup"), ValidationError);
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});
