// Unit tests for modules/financial/provider.js — the only file in the
// financial module that touches SANDBOX_BASE_URL/fetch (§51, Etapa 10).
// No real network call ever happens here: `fetch` is mocked per-test
// (same pattern as tests/frontend/portal/multi-shard-read.test.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isFinancialModuleEnabled,
  assertFinancialModuleEnabled,
  FinancialModuleDisabledError,
  AsaasApiError,
  createCustomer,
  createPayment,
  getPayment,
} from "../../../modules/financial/provider.js";

const ENABLED_ENV = { FINANCIAL_ENABLED: "true", ASAAS_API_KEY: "sandbox-key-123" };

function mockFetchOnce(responseInit) {
  const previousFetch = globalThis.fetch;
  let capturedRequest = null;
  globalThis.fetch = async (url, init) => {
    capturedRequest = { url, init };
    return new Response(JSON.stringify(responseInit.body ?? {}), {
      status: responseInit.status ?? 200,
    });
  };
  return {
    restore: () => {
      globalThis.fetch = previousFetch;
    },
    getRequest: () => capturedRequest,
  };
}

test("isFinancialModuleEnabled is true only for the exact string \"true\"", () => {
  assert.equal(isFinancialModuleEnabled({ FINANCIAL_ENABLED: "true" }), true);
  assert.equal(isFinancialModuleEnabled({ FINANCIAL_ENABLED: "false" }), false);
  assert.equal(isFinancialModuleEnabled({ FINANCIAL_ENABLED: true }), false);
  assert.equal(isFinancialModuleEnabled({}), false);
  assert.equal(isFinancialModuleEnabled(undefined), false);
});

test("assertFinancialModuleEnabled throws FinancialModuleDisabledError when the flag isn't \"true\"", () => {
  assert.throws(() => assertFinancialModuleEnabled({}), FinancialModuleDisabledError);
  assert.doesNotThrow(() => assertFinancialModuleEnabled({ FINANCIAL_ENABLED: "true" }));
});

test("createCustomer never touches fetch while the module is disabled", async () => {
  const mock = mockFetchOnce({ body: { id: "cus_1" } });
  try {
    await assert.rejects(
      () => createCustomer({}, { name: "João", email: "joao@example.com", cpfCnpj: "12345678900" }),
      FinancialModuleDisabledError,
    );
    assert.equal(mock.getRequest(), null, "fetch must never be called with the module disabled");
  } finally {
    mock.restore();
  }
});

test("createCustomer POSTs to /customers with the access_token header (Asaas auth, never Bearer)", async () => {
  const mock = mockFetchOnce({ body: { id: "cus_42" } });
  try {
    const customer = await createCustomer(ENABLED_ENV, {
      name: "João Imóveis",
      email: "joao@example.com",
      cpfCnpj: "12345678900",
      externalReference: "broker_1",
    });
    assert.equal(customer.id, "cus_42");

    const { url, init } = mock.getRequest();
    assert.equal(url, "https://sandbox.asaas.com/api/v3/customers");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.access_token, "sandbox-key-123");
    assert.equal(init.headers.Authorization, undefined);
    const body = JSON.parse(init.body);
    assert.equal(body.cpfCnpj, "12345678900");
    assert.equal(body.externalReference, "broker_1");
  } finally {
    mock.restore();
  }
});

test("createPayment defaults billingType to UNDEFINED and POSTs to /payments", async () => {
  const mock = mockFetchOnce({ body: { id: "pay_1", invoiceUrl: "https://sandbox.asaas.com/i/1" } });
  try {
    await createPayment(ENABLED_ENV, {
      customer: "cus_42",
      value: 199.9,
      dueDate: "2026-09-01",
      description: "Mensalidade",
      externalReference: "charge_1",
    });
    const { url, init } = mock.getRequest();
    assert.equal(url, "https://sandbox.asaas.com/api/v3/payments");
    const body = JSON.parse(init.body);
    assert.equal(body.billingType, "UNDEFINED");
    assert.equal(body.value, 199.9);
  } finally {
    mock.restore();
  }
});

test("getPayment GETs /payments/{id}, URL-encoding the id", async () => {
  const mock = mockFetchOnce({ body: { id: "pay 1", status: "CONFIRMED" } });
  try {
    const payment = await getPayment(ENABLED_ENV, "pay 1");
    assert.equal(payment.status, "CONFIRMED");
    const { url, init } = mock.getRequest();
    assert.equal(url, "https://sandbox.asaas.com/api/v3/payments/pay%201");
    assert.equal(init.method, "GET");
  } finally {
    mock.restore();
  }
});

test("a non-2xx Asaas response raises AsaasApiError carrying status + body", async () => {
  const mock = mockFetchOnce({ status: 400, body: { errors: [{ description: "cpfCnpj inválido" }] } });
  try {
    await assert.rejects(
      () => createCustomer(ENABLED_ENV, { name: "X", email: "x@example.com", cpfCnpj: "bad" }),
      (error) => {
        assert.ok(error instanceof AsaasApiError);
        assert.equal(error.status, 400);
        assert.equal(error.body.errors[0].description, "cpfCnpj inválido");
        return true;
      },
    );
  } finally {
    mock.restore();
  }
});

test("missing ASAAS_API_KEY raises a clear error even with the module enabled", async () => {
  const mock = mockFetchOnce({ body: {} });
  try {
    await assert.rejects(
      () => createCustomer({ FINANCIAL_ENABLED: "true" }, { name: "X", email: "x@example.com", cpfCnpj: "1" }),
      /ASAAS_API_KEY/,
    );
    assert.equal(mock.getRequest(), null, "fetch must never run without an api key");
  } finally {
    mock.restore();
  }
});
