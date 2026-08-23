import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECURITY_HEADERS,
  applySecurityHeaders,
  buildCorsHeaders,
  sanitizeText,
  timingSafeEqual,
} from "../../core/security.js";

test("applySecurityHeaders sets every §81 header", () => {
  const response = applySecurityHeaders(new Response("ok", { status: 200 }));
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(response.headers.get(name), value);
  }
});

test("applySecurityHeaders preserves status", () => {
  const response = applySecurityHeaders(new Response("nope", { status: 404 }));
  assert.equal(response.status, 404);
});

test("buildCorsHeaders only allows GET/HEAD (§80)", () => {
  const headers = buildCorsHeaders("https://imobiliarista.net", ["https://imobiliarista.net"]);
  assert.equal(headers.get("Access-Control-Allow-Methods"), "GET, HEAD, OPTIONS");
  assert.equal(headers.get("Access-Control-Allow-Origin"), "https://imobiliarista.net");
});

test("buildCorsHeaders omits origin when not allowlisted", () => {
  const headers = buildCorsHeaders("https://evil.example", ["https://imobiliarista.net"]);
  assert.equal(headers.get("Access-Control-Allow-Origin"), null);
});

test("sanitizeText strips control characters and trims", () => {
  assert.equal(sanitizeText("  Apartamento Centro  "), "Apartamento Centro");
  assert.equal(sanitizeText(42), "");
});

test("timingSafeEqual compares strings correctly", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "ab"), false);
});
