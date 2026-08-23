import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTenant, assertTenantMatch, TenantMismatchError } from "../../core/tenant.js";

test("resolveTenant derives tenant from session claims only", () => {
  const tenant = resolveTenant({ brokerId: "broker_1", slug: "joao" });
  assert.deepEqual(tenant, { brokerId: "broker_1", slug: "joao" });
});

test("resolveTenant returns null without a brokerId", () => {
  assert.equal(resolveTenant({ role: "superadmin" }), null);
  assert.equal(resolveTenant(null), null);
});

test("assertTenantMatch passes when session broker owns the resource", () => {
  assert.doesNotThrow(() =>
    assertTenantMatch({ brokerId: "broker_1", role: "broker" }, "broker_1"),
  );
});

test("assertTenantMatch throws when brokers differ (§55: never trust body brokerSlug)", () => {
  assert.throws(
    () => assertTenantMatch({ brokerId: "broker_1", role: "broker" }, "broker_2"),
    TenantMismatchError,
  );
});

test("assertTenantMatch allows superadmin across tenants", () => {
  assert.doesNotThrow(() =>
    assertTenantMatch({ brokerId: "broker_9", role: "superadmin" }, "broker_1"),
  );
});
