// Unit tests for modules/saved-search/index.js — the public HTTP handlers
// (§43, Etapa 9): no session/tenant involved (decision 1, see the file's
// header). `fetch` is mocked wherever service.js would email out.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleCreateSavedSearch,
  handleConfirmSavedSearch,
  handleUnsubscribeSavedSearch,
} from "../../../modules/saved-search/index.js";
import { createSessionToken } from "../../../core/session.js";
import { getPrivate } from "../../../storage/private.js";
import { ValidationError } from "../../../core/validation.js";
import { FakeR2Bucket } from "../../storage/fake-r2-bucket.js";

const ORIGIN = "https://imobiliarista.net";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket(), SAVED_SEARCH_TOKEN_SECRET: "test-saved-search-token-secret-do-not-use-in-prod" };
}

function req(path, { method = "GET", body } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function withMockedFetch(response, fn) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => response ?? new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
  return fn().finally(() => {
    globalThis.fetch = previousFetch;
  });
}

async function firstSavedSearchId(env) {
  const { objects } = await env.IMOB_PRIVATE.list({ prefix: "saved-searches/" });
  const key = objects[0].key;
  const record = await getPrivate(env, key);
  return record.id;
}

test("POST /api/saved-searches returns 202 with pending_confirmation", async () => {
  const env = makeEnv();
  const response = await withMockedFetch(null, () =>
    handleCreateSavedSearch(req("/api/saved-searches", { method: "POST", body: { email: "x@example.com", criteria: { city: "londrina" } } }), env),
  );
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.data.status, "pending_confirmation");
});

test("POST /api/saved-searches with an invalid body throws a ValidationError (mapped by core/app.js upstream)", async () => {
  const env = makeEnv();
  await assert.rejects(
    () => handleCreateSavedSearch(req("/api/saved-searches", { method: "POST", body: { email: "not-an-email", criteria: {} } }), env),
    ValidationError,
  );
});

test("POST /api/saved-searches returns 429 once the per-IP/day rate limit is hit", async () => {
  const env = makeEnv();
  const ipHeaders = { "Content-Type": "application/json", "CF-Connecting-IP": "8.8.8.8" };
  const requestWithIp = () =>
    new Request(`${ORIGIN}/api/saved-searches`, {
      method: "POST",
      headers: ipHeaders,
      body: JSON.stringify({ email: "x@example.com", criteria: { city: "londrina" } }),
    });

  await withMockedFetch(null, async () => {
    for (let i = 0; i < 5; i += 1) {
      await handleCreateSavedSearch(requestWithIp(), env);
    }
  });
  const response = await withMockedFetch(null, () => handleCreateSavedSearch(requestWithIp(), env));
  assert.equal(response.status, 429);
});

test("GET /api/saved-searches/confirm returns an HTML page and confirms the record", async () => {
  const env = makeEnv();
  await withMockedFetch(null, () =>
    handleCreateSavedSearch(req("/api/saved-searches", { method: "POST", body: { email: "x@example.com", criteria: { city: "londrina" } } }), env),
  );
  const savedSearchId = await firstSavedSearchId(env);
  const token = await createSessionToken({ purpose: "confirm", savedSearchId }, env.SAVED_SEARCH_TOKEN_SECRET, { ttlSeconds: 3600 });

  const response = await handleConfirmSavedSearch(req(`/api/saved-searches/confirm?token=${encodeURIComponent(token)}`), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /text\/html/);
  const html = await response.text();
  assert.match(html, /confirmada/i);
});

test("GET /api/saved-searches/confirm on an already-confirmed record still returns 200 with a distinct message", async () => {
  const env = makeEnv();
  await withMockedFetch(null, () =>
    handleCreateSavedSearch(req("/api/saved-searches", { method: "POST", body: { email: "x@example.com", criteria: { city: "londrina" } } }), env),
  );
  const savedSearchId = await firstSavedSearchId(env);
  const token = await createSessionToken({ purpose: "confirm", savedSearchId }, env.SAVED_SEARCH_TOKEN_SECRET, { ttlSeconds: 3600 });

  await handleConfirmSavedSearch(req(`/api/saved-searches/confirm?token=${encodeURIComponent(token)}`), env);
  const second = await handleConfirmSavedSearch(req(`/api/saved-searches/confirm?token=${encodeURIComponent(token)}`), env);
  assert.equal(second.status, 200);
  const html = await second.text();
  assert.match(html, /já (estava|foi) confirmada/i);
});

test("GET /api/saved-searches/confirm with an invalid token returns 400", async () => {
  const env = makeEnv();
  const response = await handleConfirmSavedSearch(req("/api/saved-searches/confirm?token=garbage"), env);
  assert.equal(response.status, 400);
});

test("GET /api/saved-searches/unsubscribe removes the alert and returns an HTML page", async () => {
  const env = makeEnv();
  await withMockedFetch(null, () =>
    handleCreateSavedSearch(req("/api/saved-searches", { method: "POST", body: { email: "x@example.com", criteria: { city: "londrina" } } }), env),
  );
  const savedSearchId = await firstSavedSearchId(env);
  const unsubToken = await createSessionToken({ purpose: "unsubscribe", savedSearchId }, env.SAVED_SEARCH_TOKEN_SECRET, { ttlSeconds: 3600 });

  const response = await handleUnsubscribeSavedSearch(req(`/api/saved-searches/unsubscribe?token=${encodeURIComponent(unsubToken)}`), env);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /cancelad/i);
});

test("GET /api/saved-searches/unsubscribe with an invalid token returns 400", async () => {
  const env = makeEnv();
  const response = await handleUnsubscribeSavedSearch(req("/api/saved-searches/unsubscribe?token=garbage"), env);
  assert.equal(response.status, 400);
});
