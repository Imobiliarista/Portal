import { test } from "node:test";
import assert from "node:assert/strict";
import {
  login,
  setAuthPassword,
  getAuthUser,
  InvalidCredentialsError,
} from "../../business/auth.js";
import { createBroker } from "../../business/brokers.js";
import { verifySessionToken } from "../../core/session.js";
import { ValidationError } from "../../core/validation.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";

const SECRET = "test-secret-do-not-use-in-prod";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket() };
}

async function makeBroker(env, overrides = {}) {
  return createBroker(env, {
    userId: "user_000789",
    slug: "joao",
    name: "João Imóveis",
    plan: "premium",
    email: "joao@imobiliarista.net",
    ...overrides,
  });
}

test("setAuthPassword hashes the password (never plaintext) and starts authVersion at 1", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);

  const record = await setAuthPassword(env, broker.userId, "correct horse battery staple");

  assert.equal(record.userId, broker.userId);
  assert.equal(record.role, "broker");
  assert.equal(record.authVersion, 1);
  assert.equal(record.passwordHash.includes("correct horse battery staple"), false);
  assert.match(record.passwordHash, /^pbkdf2-sha256\$/);

  const stored = await getAuthUser(env, broker.userId);
  assert.deepEqual(stored, record);
});

test("setAuthPassword bumps authVersion and preserves role on a second call", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);

  await setAuthPassword(env, broker.userId, "senha-inicial-123", { role: "broker" });
  const second = await setAuthPassword(env, broker.userId, "nova-senha-456");

  assert.equal(second.authVersion, 2);
  assert.equal(second.role, "broker");
});

test("setAuthPassword rejects an invalid role", async () => {
  const env = makeEnv();
  await assert.rejects(
    () => setAuthPassword(env, "user_1", "senha-valida-123", { role: "not-a-role" }),
    ValidationError,
  );
});

test("login with correct credentials issues a verifiable session token (§26, §28)", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  await setAuthPassword(env, broker.userId, "correct horse battery staple");

  const { token, claims } = await login(
    env,
    { email: "JOAO@imobiliarista.net", password: "correct horse battery staple" },
    SECRET,
  );

  assert.equal(claims.userId, broker.userId);
  assert.equal(claims.brokerId, broker.brokerId);
  assert.equal(claims.slug, "joao");
  assert.equal(claims.role, "broker");
  assert.equal(claims.authVersion, 1);

  const verified = await verifySessionToken(token, SECRET);
  assert.equal(verified.brokerId, broker.brokerId);
});

test("login with wrong password fails with the generic InvalidCredentialsError", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  await setAuthPassword(env, broker.userId, "correct horse battery staple");

  await assert.rejects(
    () => login(env, { email: "joao@imobiliarista.net", password: "wrong-password" }, SECRET),
    InvalidCredentialsError,
  );
});

test("login with an unknown e-mail fails with the same InvalidCredentialsError", async () => {
  const env = makeEnv();

  await assert.rejects(
    () => login(env, { email: "ninguem@imobiliarista.net", password: "qualquer-coisa" }, SECRET),
    InvalidCredentialsError,
  );
});

test("login never reveals whether the failure was the e-mail or the password", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  await setAuthPassword(env, broker.userId, "correct horse battery staple");

  let unknownEmailError;
  let wrongPasswordError;
  try {
    await login(env, { email: "ninguem@imobiliarista.net", password: "x" }, SECRET);
  } catch (error) {
    unknownEmailError = error;
  }
  try {
    await login(env, { email: "joao@imobiliarista.net", password: "senha-errada" }, SECRET);
  } catch (error) {
    wrongPasswordError = error;
  }

  assert.equal(unknownEmailError.message, wrongPasswordError.message);
  assert.equal(unknownEmailError.name, "InvalidCredentialsError");
  assert.equal(wrongPasswordError.name, "InvalidCredentialsError");
});

test("login fails when the broker exists but has no credential record yet", async () => {
  const env = makeEnv();
  await makeBroker(env);

  await assert.rejects(
    () => login(env, { email: "joao@imobiliarista.net", password: "qualquer-coisa" }, SECRET),
    InvalidCredentialsError,
  );
});

test("login rejects malformed input without touching storage", async () => {
  const env = makeEnv();
  await assert.rejects(() => login(env, { email: "not-an-email", password: "x" }, SECRET), InvalidCredentialsError);
  await assert.rejects(() => login(env, { email: "joao@imobiliarista.net", password: "" }, SECRET), InvalidCredentialsError);
});
