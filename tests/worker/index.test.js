// Smoke/wiring test for worker/index.js (§71 entry point). Doesn't
// re-test any individual handler's business logic (that's covered by
// tests/security/*.test.js and the business/module-level suites) — only
// that the route table itself is wired: the health check answers, an
// unmatched /api/* path falls into the generic 404 instead of crashing,
// and a route that requires a session correctly surfaces as a 401
// through the real fetch(request, env) entry point (proving worker/index.js
// + core/app.js compose end-to-end, not just in isolation).

import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../../worker/index.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";

const ORIGIN = "https://portal.imobiliarista.net";

function makeEnv() {
  return {
    IMOB_PRIVATE: new FakeR2Bucket(),
    IMOB_DATA: new FakeR2Bucket(),
    IMOB_MEDIA: new FakeR2Bucket(),
    SESSION_SECRET: "test-session-secret-do-not-use-in-prod",
  };
}

test("GET /api/health returns 200 ok", async () => {
  const response = await worker.fetch(new Request(`${ORIGIN}/api/health`), makeEnv());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.status, "ok");
});

test("an unregistered GET /api/* path falls through to the generic 501 catch-all, not a 404 or a crash", async () => {
  const response = await worker.fetch(new Request(`${ORIGIN}/api/this-route-does-not-exist`), makeEnv());
  assert.equal(response.status, 501);
});

test("a path outside /api/* entirely is a plain router 404 (Static Assets/R2 handle everything else, §73/§89)", async () => {
  const response = await worker.fetch(new Request(`${ORIGIN}/nao-e-uma-rota-de-api`), makeEnv());
  assert.equal(response.status, 404);
});

test("GET /api/me/profile without a session cookie surfaces as a 401 through the real fetch entry point", async () => {
  const response = await worker.fetch(new Request(`${ORIGIN}/api/me/profile`), makeEnv());
  assert.equal(response.status, 401);
});

test("GET /api/admin/brokers without a session cookie surfaces as a 401, not a 500, through the real fetch entry point", async () => {
  const response = await worker.fetch(new Request(`${ORIGIN}/api/admin/brokers`), makeEnv());
  assert.equal(response.status, 401);
});

test("POST /api/admin/bootstrap-special-accounts without SUPERADMIN_BOOTSTRAP_SECRET configured is byte-for-byte indistinguishable from a genuinely unregistered route", async () => {
  const env = makeEnv(); // no SUPERADMIN_BOOTSTRAP_SECRET
  const bootstrapResponse = await worker.fetch(
    new Request(`${ORIGIN}/api/admin/bootstrap-special-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: "whatever", accounts: { master: { password: "12345678" } } }),
    }),
    env,
  );
  const genuinelyMissingResponse = await worker.fetch(new Request(`${ORIGIN}/nao-e-uma-rota-de-api`), env);

  assert.equal(bootstrapResponse.status, 404);
  assert.equal(bootstrapResponse.status, genuinelyMissingResponse.status);
  assert.equal(await bootstrapResponse.text(), await genuinelyMissingResponse.text());
  assert.equal(bootstrapResponse.headers.get("Content-Type"), genuinelyMissingResponse.headers.get("Content-Type"));
});

test("POST /api/webhooks/asaas is reachable without a session (public route) and reports the module disabled", async () => {
  const response = await worker.fetch(
    new Request(`${ORIGIN}/api/webhooks/asaas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "evt_1", event: "PAYMENT_CONFIRMED", payment: { id: "pay_1" } }),
    }),
    makeEnv(), // no FINANCIAL_ENABLED set
  );
  assert.equal(response.status, 503);
});
