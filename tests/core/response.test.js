import { test } from "node:test";
import assert from "node:assert/strict";
import {
  success,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  internalError,
  notImplemented,
} from "../../core/response.js";

test("success wraps data in { ok: true, data }", async () => {
  const response = success({ slug: "joao" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  const body = await response.json();
  assert.deepEqual(body, { ok: true, data: { slug: "joao" } });
});

test("success accepts custom status and meta", async () => {
  const response = success({ id: 1 }, { status: 201, meta: { publicationVersion: 3 } });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(body, { ok: true, data: { id: 1 }, meta: { publicationVersion: 3 } });
});

test("error helpers set expected status codes and envelope", async () => {
  const cases = [
    [badRequest("x"), 400, "bad_request"],
    [unauthorized(), 401, "unauthorized"],
    [forbidden(), 403, "forbidden"],
    [notFound(), 404, "not_found"],
    [conflict(), 409, "conflict"],
    [internalError(), 500, "internal_error"],
    [notImplemented(), 501, "not_implemented"],
  ];

  for (const [response, status, code] of cases) {
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, code);
  }
});
