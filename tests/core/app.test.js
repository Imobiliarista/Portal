// Unit tests for core/app.js (§71) — the fetch-handler factory that
// composes a Router with security headers + a single error->response
// mapping used by every route in worker/index.js. Built directly against
// core/router.js here (no HTTP handlers involved), so a bug in this
// mapping (e.g. an auth error leaking a stack trace) is caught in one
// place instead of only incidentally through worker-level tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../core/app.js";
import { Router } from "../../core/router.js";
import { SECURITY_HEADERS } from "../../core/security.js";
import { ValidationError } from "../../core/validation.js";
import { ForbiddenError } from "../../core/permissions.js";
import { TenantMismatchError } from "../../core/tenant.js";
import { UnauthorizedError } from "../../core/session.js";

function buildApp(routes) {
  const router = new Router();
  for (const [method, path, handler] of routes) {
    router[method.toLowerCase()](path, handler);
  }
  return createApp(router, { loggerContext: "test" });
}

function assertHasSecurityHeaders(response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(response.headers.get(name), value, `missing/wrong security header ${name}`);
  }
}

test("a matched route's response passes through untouched except for security headers", async () => {
  const app = buildApp([["GET", "/ok", async () => new Response(JSON.stringify({ ok: true }), { status: 200 })]]);
  const response = await app(new Request("https://x.test/ok"));
  assert.equal(response.status, 200);
  assertHasSecurityHeaders(response);
  assert.deepEqual(await response.json(), { ok: true });
});

test("an unmatched route returns a 404 with security headers, not a raw miss", async () => {
  const app = buildApp([]);
  const response = await app(new Request("https://x.test/nope"));
  assert.equal(response.status, 404);
  assertHasSecurityHeaders(response);
});

test("route params from core/router.js are forwarded to the handler", async () => {
  const app = buildApp([
    ["GET", "/items/:id", async (request, env, ctx, params) => new Response(JSON.stringify({ id: params.id }))],
  ]);
  const response = await app(new Request("https://x.test/items/abc123"));
  const body = await response.json();
  assert.equal(body.id, "abc123");
});

test("a thrown ValidationError becomes a 422 with the field errors, never a raw stack trace", async () => {
  const app = buildApp([
    [
      "POST",
      "/thing",
      async () => {
        throw new ValidationError([{ field: "email", message: "obrigatório" }]);
      },
    ],
  ]);
  const response = await app(new Request("https://x.test/thing", { method: "POST" }));
  assert.equal(response.status, 422);
  assertHasSecurityHeaders(response);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "validation_error");
  assert.deepEqual(body.error.details, [{ field: "email", message: "obrigatório" }]);
});

test("a thrown UnauthorizedError becomes a 401", async () => {
  const app = buildApp([
    [
      "GET",
      "/private",
      async () => {
        throw new UnauthorizedError("sessão inválida");
      },
    ],
  ]);
  const response = await app(new Request("https://x.test/private"));
  assert.equal(response.status, 401);
  assertHasSecurityHeaders(response);
});

test("a thrown ForbiddenError becomes a 403", async () => {
  const app = buildApp([
    [
      "GET",
      "/admin-only",
      async () => {
        throw new ForbiddenError("papel insuficiente");
      },
    ],
  ]);
  const response = await app(new Request("https://x.test/admin-only"));
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, "forbidden");
});

test("a thrown TenantMismatchError also becomes a 403 (same bucket as ForbiddenError)", async () => {
  const app = buildApp([
    [
      "GET",
      "/other-brokers-thing",
      async () => {
        throw new TenantMismatchError("recurso pertence a outro corretor");
      },
    ],
  ]);
  const response = await app(new Request("https://x.test/other-brokers-thing"));
  assert.equal(response.status, 403);
});

test("an unexpected thrown error becomes a generic 500, never leaking its message/stack", async () => {
  const app = buildApp([
    [
      "GET",
      "/boom",
      async () => {
        throw new Error("segredo interno de implementação");
      },
    ],
  ]);
  const response = await app(new Request("https://x.test/boom"));
  assert.equal(response.status, 500);
  assertHasSecurityHeaders(response);
  const body = await response.json();
  assert.doesNotMatch(JSON.stringify(body), /segredo interno de implementação/);
});
