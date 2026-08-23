import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, isSensitiveKey } from "../../core/logger.js";

test("isSensitiveKey matches every field §79 forbids logging", () => {
  for (const key of ["password", "passwordHash", "cookie", "token", "secret", "secrets", "cpf", "authorization", "sessionId"]) {
    assert.equal(isSensitiveKey(key), true, `expected "${key}" to be sensitive`);
  }
  assert.equal(isSensitiveKey("title"), false);
});

test("redact replaces sensitive fields, deeply, without mutating input", () => {
  const input = {
    userId: "user_1",
    passwordHash: "abc123",
    nested: { token: "secret-token", ok: true },
  };
  const output = redact(input);

  assert.equal(output.passwordHash, "[REDACTED]");
  assert.equal(output.nested.token, "[REDACTED]");
  assert.equal(output.nested.ok, true);
  assert.equal(output.userId, "user_1");

  // original object is untouched
  assert.equal(input.passwordHash, "abc123");
});

test("redact handles arrays and circular references safely", () => {
  const circular = { name: "x" };
  circular.self = circular;
  const output = redact({ list: [{ password: "p" }], circular });
  assert.equal(output.list[0].password, "[REDACTED]");
  assert.equal(output.circular.self, "[CIRCULAR]");
});
