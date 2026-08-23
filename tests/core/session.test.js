import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  verifySessionToken,
  buildSessionCookie,
  buildLogoutCookie,
  parseCookies,
  getSessionTokenFromRequest,
  SESSION_COOKIE_NAME,
} from "../../core/session.js";

const SECRET = "test-secret-do-not-use-in-prod";

test("createSessionToken + verifySessionToken round-trip claims (§28)", async () => {
  const claims = { userId: "user_1", brokerId: "broker_1", slug: "joao", role: "broker", authVersion: 1 };
  const token = await createSessionToken(claims, SECRET);
  const verified = await verifySessionToken(token, SECRET);

  assert.equal(verified.userId, "user_1");
  assert.equal(verified.brokerId, "broker_1");
  assert.equal(verified.role, "broker");
  assert.equal(typeof verified.iat, "number");
  assert.equal(typeof verified.exp, "number");
});

test("verifySessionToken rejects a token signed with a different secret", async () => {
  const token = await createSessionToken({ userId: "u1" }, SECRET);
  const verified = await verifySessionToken(token, "wrong-secret");
  assert.equal(verified, null);
});

test("verifySessionToken rejects a tampered payload", async () => {
  const token = await createSessionToken({ userId: "u1", role: "broker" }, SECRET);
  const [payload, signature] = token.split(".");
  const tampered = `${payload}x.${signature}`;
  assert.equal(await verifySessionToken(tampered, SECRET), null);
});

test("verifySessionToken rejects an expired token", async () => {
  const token = await createSessionToken({ userId: "u1" }, SECRET, { ttlSeconds: -10 });
  assert.equal(await verifySessionToken(token, SECRET), null);
});

test("verifySessionToken rejects malformed input", async () => {
  assert.equal(await verifySessionToken("not-a-token", SECRET), null);
  assert.equal(await verifySessionToken("", SECRET), null);
  assert.equal(await verifySessionToken(undefined, SECRET), null);
});

test("buildSessionCookie sets HttpOnly, Secure, SameSite (§28)", () => {
  const cookie = buildSessionCookie("abc.def");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=abc\\.def`));
});

test("buildLogoutCookie expires immediately", () => {
  assert.match(buildLogoutCookie(), /Max-Age=0/);
});

test("parseCookies parses a Cookie header into a map", () => {
  const parsed = parseCookies(`${SESSION_COOKIE_NAME}=tok123; other=value`);
  assert.equal(parsed[SESSION_COOKIE_NAME], "tok123");
  assert.equal(parsed.other, "value");
});

test("getSessionTokenFromRequest reads the session cookie off a Request", () => {
  const request = new Request("https://painel.imobiliarista.net/api/me", {
    headers: { Cookie: `${SESSION_COOKIE_NAME}=tok456` },
  });
  assert.equal(getSessionTokenFromRequest(request), "tok456");
});

test("getSessionTokenFromRequest returns null without a cookie", () => {
  const request = new Request("https://painel.imobiliarista.net/api/me");
  assert.equal(getSessionTokenFromRequest(request), null);
});
