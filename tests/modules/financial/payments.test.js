// Unit tests for modules/financial/payments.js (§51, Etapa 10). The
// common path (list/get) reads only from R2 — no Asaas call — so it is
// exercised straight against a FakeR2Bucket-backed env with a
// hand-written charge record. Only syncChargeStatus talks to the
// provider, so `fetch` is mocked for that one path (same pattern as
// checkout.test.js/provider.test.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listChargesForBroker,
  getChargeForBroker,
  mapAsaasStatus,
  syncChargeStatus,
  ChargeNotFoundError,
} from "../../../modules/financial/payments.js";
import { putPrivate, getPrivate } from "../../../storage/private.js";
import { privateKeys } from "../../../storage/keys.js";
import { addFinancialChargeToBrokerIndex } from "../../../storage/indexes.js";
import { FakeR2Bucket } from "../../storage/fake-r2-bucket.js";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket(), FINANCIAL_ENABLED: "true", ASAAS_API_KEY: "sandbox-key-123" };
}

async function seedCharge(env, brokerId, overrides = {}) {
  const chargeId = overrides.chargeId ?? `charge_${crypto.randomUUID()}`;
  const charge = {
    schemaVersion: 1,
    chargeId,
    brokerId,
    planId: "pro",
    kind: "setup",
    amount: 100,
    status: "pending",
    provider: "asaas",
    providerCustomerId: "cus_1",
    providerPaymentId: overrides.providerPaymentId ?? "pay_1",
    invoiceUrl: null,
    billingType: "UNDEFINED",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    confirmedAt: null,
    ...overrides,
  };
  await putPrivate(env, privateKeys.financialCharge(chargeId), charge);
  await addFinancialChargeToBrokerIndex(env, brokerId, chargeId);
  return charge;
}

test("mapAsaasStatus maps every known Asaas status to the internal vocabulary", () => {
  assert.equal(mapAsaasStatus("RECEIVED"), "confirmed");
  assert.equal(mapAsaasStatus("RECEIVED_IN_CASH"), "confirmed");
  assert.equal(mapAsaasStatus("CONFIRMED"), "confirmed");
  assert.equal(mapAsaasStatus("OVERDUE"), "overdue");
  assert.equal(mapAsaasStatus("REFUNDED"), "refunded");
  assert.equal(mapAsaasStatus("REFUND_REQUESTED"), "refunded");
  assert.equal(mapAsaasStatus("CHARGEBACK_REQUESTED"), "chargeback");
  assert.equal(mapAsaasStatus("CHARGEBACK_DISPUTE"), "chargeback");
  assert.equal(mapAsaasStatus("PENDING"), "pending");
  assert.equal(mapAsaasStatus("AWAITING_RISK_ANALYSIS"), "pending");
});

test("mapAsaasStatus falls back to \"pending\" for an unknown/future Asaas status, never throws", () => {
  assert.equal(mapAsaasStatus("SOME_NEW_STATUS_ASAAS_ADDS_LATER"), "pending");
  assert.equal(mapAsaasStatus(undefined), "pending");
});

test("listChargesForBroker returns charges newest-first", async () => {
  const env = makeEnv();
  await seedCharge(env, "broker_1", { chargeId: "charge_old", createdAt: "2026-01-01T00:00:00.000Z" });
  await seedCharge(env, "broker_1", { chargeId: "charge_new", createdAt: "2026-06-01T00:00:00.000Z" });

  const charges = await listChargesForBroker(env, "broker_1");
  assert.deepEqual(
    charges.map((c) => c.chargeId),
    ["charge_new", "charge_old"],
  );
});

test("listChargesForBroker skips an orphaned index entry instead of throwing", async () => {
  const env = makeEnv();
  await seedCharge(env, "broker_1", { chargeId: "charge_real" });
  await addFinancialChargeToBrokerIndex(env, "broker_1", "charge_deleted_but_still_indexed");

  const charges = await listChargesForBroker(env, "broker_1");
  assert.deepEqual(charges.map((c) => c.chargeId), ["charge_real"]);
});

test("listChargesForBroker returns [] for a broker with no charges", async () => {
  const env = makeEnv();
  assert.deepEqual(await listChargesForBroker(env, "broker_none"), []);
});

test("getChargeForBroker returns null when the charge belongs to a different broker (§55)", async () => {
  const env = makeEnv();
  const charge = await seedCharge(env, "broker_owner");
  assert.equal(await getChargeForBroker(env, "broker_attacker", charge.chargeId), null);
  assert.deepEqual(await getChargeForBroker(env, "broker_owner", charge.chargeId), charge);
});

test("getChargeForBroker returns null for an unknown chargeId", async () => {
  const env = makeEnv();
  assert.equal(await getChargeForBroker(env, "broker_1", "charge_ghost"), null);
});

test("syncChargeStatus updates the local status from a mocked Asaas response", async () => {
  const env = makeEnv();
  const charge = await seedCharge(env, "broker_1", { status: "pending", providerPaymentId: "pay_99" });

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "pay_99", status: "RECEIVED" }), { status: 200 });
  try {
    const updated = await syncChargeStatus(env, charge.chargeId);
    assert.equal(updated.status, "confirmed");
    const stored = await getPrivate(env, privateKeys.financialCharge(charge.chargeId));
    assert.equal(stored.status, "confirmed");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("syncChargeStatus throws ChargeNotFoundError for an unknown chargeId, never touching fetch", async () => {
  const env = makeEnv();
  const previousFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}");
  };
  try {
    await assert.rejects(() => syncChargeStatus(env, "charge_ghost"), ChargeNotFoundError);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
