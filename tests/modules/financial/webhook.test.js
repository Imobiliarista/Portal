// Unit tests for modules/financial/webhook.js — POST /api/webhooks/asaas
// (§51, Etapa 10). This is a public, unauthenticated-by-session route
// (asaas-access-token header instead), so every test calls the handler
// directly with a plain Request, no cookie/tenant involved.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAsaasWebhook } from "../../../modules/financial/webhook.js";
import { putPrivate, getPrivate } from "../../../storage/private.js";
import { privateKeys } from "../../../storage/keys.js";
import { FakeR2Bucket } from "../../storage/fake-r2-bucket.js";

const WEBHOOK_TOKEN = "test-asaas-webhook-token";
const ORIGIN = "https://imobiliarista.net";

function makeEnv(overrides = {}) {
  return {
    IMOB_PRIVATE: new FakeR2Bucket(),
    FINANCIAL_ENABLED: "true",
    ASAAS_WEBHOOK_TOKEN: WEBHOOK_TOKEN,
    ...overrides,
  };
}

function webhookRequest(body, options = {}) {
  const hasTokenKey = Object.prototype.hasOwnProperty.call(options, "token");
  const token = hasTokenKey ? options.token : WEBHOOK_TOKEN;
  return new Request(`${ORIGIN}/api/webhooks/asaas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token !== null ? { "asaas-access-token": token } : {}),
    },
    body: options.rawBody !== undefined ? options.rawBody : JSON.stringify(body),
  });
}

async function seedCharge(env, chargeId, overrides = {}) {
  const charge = {
    schemaVersion: 1,
    chargeId,
    brokerId: "broker_1",
    planId: "pro",
    kind: "monthly",
    amount: 50,
    status: "pending",
    provider: "asaas",
    providerCustomerId: "cus_1",
    providerPaymentId: "pay_1",
    invoiceUrl: null,
    billingType: "UNDEFINED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    confirmedAt: null,
    ...overrides,
  };
  await putPrivate(env, privateKeys.financialCharge(chargeId), charge);
  return charge;
}

test("responds 503 when the module is disabled, before checking the token", async () => {
  const env = makeEnv({ FINANCIAL_ENABLED: "false" });
  const response = await handleAsaasWebhook(webhookRequest({ id: "evt_1" }, { token: "wrong" }), env);
  assert.equal(response.status, 503);
});

test("responds 503 when ASAAS_WEBHOOK_TOKEN isn't configured", async () => {
  const env = makeEnv({ ASAAS_WEBHOOK_TOKEN: undefined });
  const response = await handleAsaasWebhook(webhookRequest({ id: "evt_1" }), env);
  assert.equal(response.status, 503);
});

test("responds 401 for a wrong/missing asaas-access-token", async () => {
  const env = makeEnv();
  const wrong = await handleAsaasWebhook(webhookRequest({ id: "evt_1" }, { token: "wrong-token" }), env);
  assert.equal(wrong.status, 401);

  const missing = await handleAsaasWebhook(webhookRequest({ id: "evt_1" }, { token: null }), env);
  assert.equal(missing.status, 401);
});

test("responds 400 for invalid JSON", async () => {
  const env = makeEnv();
  const response = await handleAsaasWebhook(webhookRequest(null, { rawBody: "{not json" }), env);
  assert.equal(response.status, 400);
});

test("responds 400 for a payload missing id/event/payment.id", async () => {
  const env = makeEnv();
  const response = await handleAsaasWebhook(webhookRequest({ event: "PAYMENT_CONFIRMED" }), env);
  assert.equal(response.status, 400);
});

test("an event for an unknown chargeId is acknowledged (matched: false), never a 4xx/5xx (§ don't make Asaas retry)", async () => {
  const env = makeEnv();
  const response = await handleAsaasWebhook(
    webhookRequest({
      id: "evt_1",
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay_1", status: "CONFIRMED", externalReference: "charge_ghost" },
    }),
    env,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.matched, false);
});

test("PAYMENT_CONFIRMED updates the charge's status and sets confirmedAt", async () => {
  const env = makeEnv();
  await seedCharge(env, "charge_1");

  const response = await handleAsaasWebhook(
    webhookRequest({
      id: "evt_1",
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay_1", status: "CONFIRMED", externalReference: "charge_1" },
    }),
    env,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.matched, true);
  assert.equal(body.data.status, "confirmed");

  const stored = await getPrivate(env, privateKeys.financialCharge("charge_1"));
  assert.equal(stored.status, "confirmed");
  assert.ok(stored.confirmedAt, "confirmedAt must be set on first confirmation");
});

test("an OVERDUE-like event updates status but never sets confirmedAt", async () => {
  const env = makeEnv();
  await seedCharge(env, "charge_1");

  await handleAsaasWebhook(
    webhookRequest({
      id: "evt_1",
      event: "PAYMENT_OVERDUE",
      payment: { id: "pay_1", status: "OVERDUE", externalReference: "charge_1" },
    }),
    env,
  );

  const stored = await getPrivate(env, privateKeys.financialCharge("charge_1"));
  assert.equal(stored.status, "overdue");
  assert.equal(stored.confirmedAt, null);
});

test("the same event id delivered twice is deduped — the second delivery never re-applies the transition", async () => {
  const env = makeEnv();
  await seedCharge(env, "charge_1");

  const eventBody = {
    id: "evt_1",
    event: "PAYMENT_CONFIRMED",
    payment: { id: "pay_1", status: "CONFIRMED", externalReference: "charge_1" },
  };
  await handleAsaasWebhook(webhookRequest(eventBody), env);

  // Tamper with the stored charge to prove a second delivery is a true no-op.
  await putPrivate(env, privateKeys.financialCharge("charge_1"), {
    ...(await getPrivate(env, privateKeys.financialCharge("charge_1"))),
    status: "manually-changed",
  });

  const secondResponse = await handleAsaasWebhook(webhookRequest(eventBody), env);
  assert.equal(secondResponse.status, 200);
  const body = await secondResponse.json();
  assert.equal(body.data.deduped, true);

  const stored = await getPrivate(env, privateKeys.financialCharge("charge_1"));
  assert.equal(stored.status, "manually-changed", "a deduped event must not touch the charge at all");
});
