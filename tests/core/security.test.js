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

// Etapa 11 sub-lote 5 (revisão headers/CORS/cache): the CSP predates
// modules/video-youtube (Etapa 9) and was missing frame-src entirely —
// harmless only because this CSP never reaches the portal page that
// embeds the youtube-nocookie.com iframe (see this file's own header
// comment). Locked in here so it can't silently regress once that
// wiring gap is closed.
test("the CSP allows framing youtube-nocookie.com (modules/video-youtube's iframe embed, §50)", () => {
  assert.match(SECURITY_HEADERS["Content-Security-Policy"], /frame-src[^;]*https:\/\/www\.youtube-nocookie\.com/);
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
