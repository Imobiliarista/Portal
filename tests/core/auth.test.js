// §27 hotfix (PR #19): core/auth.js's old server-side hashPassword/
// verifyPassword (210k PBKDF2 iterations per login, blowing past Workers
// Free's 10ms CPU budget) were removed entirely — PBKDF2 now runs in the
// browser (frontend/painel/auth.js), and this module only does the cheap
// per-login crypto: salt handling + applying PASSWORD_PEPPER to the
// browser's PBKDF2 result. This file used to test the removed functions;
// it now covers their replacements.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateSalt,
  deriveDummySalt,
  buildSaltPayload,
  hashPbkdf2Result,
  verifyPbkdf2Result,
  deriveClientPbkdf2,
  PBKDF2_ITERATIONS,
  SALT_BYTES,
} from "../../core/auth.js";

const PEPPER = "test-pepper-do-not-use-in-prod";

test("generateSalt produces a fresh, SALT_BYTES-long salt every time", () => {
  const a = generateSalt();
  const b = generateSalt();
  assert.notEqual(a, b);
  assert.equal(Buffer.from(a, "base64").length, SALT_BYTES);
});

test("deriveClientPbkdf2 rejects short passwords", async () => {
  await assert.rejects(() => deriveClientPbkdf2("short", generateSalt()));
});

test("deriveClientPbkdf2 is deterministic for the same password/salt/iterations, and differs with a different salt", async () => {
  const salt = generateSalt();
  const a = await deriveClientPbkdf2("correct horse battery staple", salt);
  const b = await deriveClientPbkdf2("correct horse battery staple", salt);
  assert.equal(a, b);

  const c = await deriveClientPbkdf2("correct horse battery staple", generateSalt());
  assert.notEqual(a, c);
});

test("hashPbkdf2Result never returns the raw PBKDF2 result and is tagged hmac-sha256", async () => {
  const pbkdf2Result = await deriveClientPbkdf2("correct horse battery staple", generateSalt());
  const verifier = await hashPbkdf2Result(pbkdf2Result, PEPPER);

  assert.equal(verifier.includes(pbkdf2Result), false);
  assert.match(verifier, /^hmac-sha256\$/);
});

test("hashPbkdf2Result + verifyPbkdf2Result round-trip", async () => {
  const salt = generateSalt();
  const pbkdf2Result = await deriveClientPbkdf2("correct horse battery staple", salt);
  const verifier = await hashPbkdf2Result(pbkdf2Result, PEPPER);

  assert.equal(await verifyPbkdf2Result(pbkdf2Result, PEPPER, verifier), true);

  const wrongResult = await deriveClientPbkdf2("outra senha completamente diferente", salt);
  assert.equal(await verifyPbkdf2Result(wrongResult, PEPPER, verifier), false);
});

test("verifyPbkdf2Result returns false for malformed or missing stored verifiers", async () => {
  assert.equal(await verifyPbkdf2Result("x", PEPPER, "not-a-real-verifier"), false);
  assert.equal(await verifyPbkdf2Result("x", PEPPER, undefined), false);
});

test("buildSaltPayload shapes the salt/iterations/algorithm the browser needs", () => {
  const salt = generateSalt();
  const payload = buildSaltPayload(salt);
  assert.deepEqual(payload, { algorithm: "pbkdf2-sha256", iterations: PBKDF2_ITERATIONS, salt });
});

// §26 "resposta genérica" — deriveDummySalt must be deterministic for the
// same identifier hash (so repeated calls for an unknown identifier can't
// be told apart from a real one), yet still vary with the identifier.
test("deriveDummySalt is deterministic per identifier and varies across identifiers", async () => {
  const a1 = await deriveDummySalt("identifier-hash-a", PEPPER);
  const a2 = await deriveDummySalt("identifier-hash-a", PEPPER);
  const b = await deriveDummySalt("identifier-hash-b", PEPPER);

  assert.equal(a1, a2);
  assert.notEqual(a1, b);
  assert.equal(Buffer.from(a1, "base64").length, SALT_BYTES);
});
