import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../../core/auth.js";

test("hashPassword never returns the plaintext or a bare SHA-256 (§27)", async () => {
  const hash = await hashPassword("super-secreta-123");
  assert.equal(hash.includes("super-secreta-123"), false);
  assert.match(hash, /^pbkdf2-sha256\$\d+\$[^$]+\$[^$]+$/);
});

test("hashPassword + verifyPassword round-trip", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("hashPassword produces a different salt (and hash) every time", async () => {
  const a = await hashPassword("mesma-senha-123");
  const b = await hashPassword("mesma-senha-123");
  assert.notEqual(a, b);
});

test("hashPassword rejects short passwords", async () => {
  await assert.rejects(() => hashPassword("short"));
});

test("verifyPassword returns false for malformed stored hashes", async () => {
  assert.equal(await verifyPassword("x", "not-a-real-hash"), false);
  assert.equal(await verifyPassword("x", undefined), false);
});
