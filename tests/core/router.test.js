import { test } from "node:test";
import assert from "node:assert/strict";
import { Router } from "../../core/router.js";

test("matches a static route by method + path", () => {
  const router = new Router();
  router.get("/api/health", () => "health");
  const match = router.match("GET", "/api/health");
  assert.ok(match);
  assert.equal(match.handler(), "health");
});

test("returns null when nothing matches", () => {
  const router = new Router();
  router.get("/api/health", () => "health");
  assert.equal(router.match("GET", "/api/missing"), null);
  assert.equal(router.match("POST", "/api/health"), null);
});

test("extracts named params", () => {
  const router = new Router();
  router.get("/api/me/listings/:id", () => "handler");
  const match = router.match("GET", "/api/me/listings/listing_000456");
  assert.deepEqual(match.params, { id: "listing_000456" });
});

test("supports a trailing wildcard segment", () => {
  const router = new Router();
  router.get("/api/*", () => "wildcard");
  const match = router.match("GET", "/api/admin/brokers/broker_1");
  assert.ok(match);
});

test("different HTTP methods on the same path are independent", () => {
  const router = new Router();
  router.get("/api/me/listings/:id", () => "get");
  router.put("/api/me/listings/:id", () => "put");
  router.delete("/api/me/listings/:id", () => "delete");

  assert.equal(router.match("GET", "/api/me/listings/1").handler(), "get");
  assert.equal(router.match("PUT", "/api/me/listings/1").handler(), "put");
  assert.equal(router.match("DELETE", "/api/me/listings/1").handler(), "delete");
});
