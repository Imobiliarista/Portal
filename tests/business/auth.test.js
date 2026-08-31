// §27 hotfix (PR #19): login moved from e-mail+password (server-side PBKDF2)
// to CPF + a PBKDF2 result the browser already derived locally, peppered
// with an HMAC the Worker applies (core/auth.js). This file used to build
// its fixtures around the old e-mail+password shape; it now drives the
// same scenarios through the real CPF/PBKDF2 flow.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  login,
  setAuthPassword,
  setAuthPasswordFromClientResult,
  getAuthUser,
  InvalidCredentialsError,
} from "../../business/auth.js";
import { createBroker, deleteBroker } from "../../business/brokers.js";
import { deriveClientPbkdf2 } from "../../core/auth.js";
import { verifySessionToken } from "../../core/session.js";
import { ValidationError } from "../../core/validation.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";
import { nextCpf } from "../support/cpf.js";

const SESSION_SECRET = "test-session-secret-do-not-use-in-prod";
const PEPPER = "test-pepper-do-not-use-in-prod";
const LOGIN_INDEX_SECRET = "test-login-index-secret-do-not-use-in-prod";
const SECRETS = { sessionSecret: SESSION_SECRET, pepper: PEPPER, loginIndexSecret: LOGIN_INDEX_SECRET };

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket() };
}

async function makeBroker(env, overrides = {}) {
  return createBroker(
    env,
    {
      userId: "user_000789",
      slug: "joao",
      name: "João Imóveis",
      plan: "premium",
      cpf: overrides.cpf ?? nextCpf(),
      ...overrides,
    },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
}

/** Mirrors the browser: derive the PBKDF2 result locally against the record's real salt. */
async function pbkdf2ResultFor(authRecord, password) {
  return deriveClientPbkdf2(password, authRecord.pbkdf2Salt, authRecord.pbkdf2Iterations);
}

test("setAuthPassword hashes the password (never plaintext) and starts authVersion at 1", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);

  const record = await setAuthPassword(env, broker.userId, "correct horse battery staple", { pepper: PEPPER });

  assert.equal(record.userId, broker.userId);
  assert.equal(record.role, "broker");
  assert.equal(record.authVersion, 1);
  assert.equal(record.verifier.includes("correct horse battery staple"), false);
  assert.match(record.verifier, /^hmac-sha256\$/);

  const stored = await getAuthUser(env, broker.userId);
  assert.deepEqual(stored, record);
});

test("setAuthPassword bumps authVersion and preserves role on a second call", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);

  await setAuthPassword(env, broker.userId, "senha-inicial-123", { role: "broker", pepper: PEPPER });
  const second = await setAuthPassword(env, broker.userId, "nova-senha-456", { pepper: PEPPER });

  assert.equal(second.authVersion, 2);
  assert.equal(second.role, "broker");
});

test("setAuthPassword rejects an invalid role", async () => {
  const env = makeEnv();
  await assert.rejects(
    () => setAuthPassword(env, "user_1", "senha-valida-123", { role: "not-a-role", pepper: PEPPER }),
    ValidationError,
  );
});

test("setAuthPassword requires the pepper", async () => {
  const env = makeEnv();
  await assert.rejects(() => setAuthPassword(env, "user_1", "senha-valida-123"), ValidationError);
});

test("login with correct credentials issues a verifiable session token (§26, §28)", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const authRecord = await setAuthPassword(env, broker.userId, "correct horse battery staple", { pepper: PEPPER });

  const { token, claims } = await login(
    env,
    { identifier: broker.cpf, pbkdf2Result: await pbkdf2ResultFor(authRecord, "correct horse battery staple") },
    SECRETS,
  );

  assert.equal(claims.userId, broker.userId);
  assert.equal(claims.brokerId, broker.brokerId);
  assert.equal(claims.slug, "joao");
  assert.equal(claims.role, "broker");
  assert.equal(claims.authVersion, 1);

  const verified = await verifySessionToken(token, SESSION_SECRET);
  assert.equal(verified.brokerId, broker.brokerId);
});

test("login with wrong password fails with the generic InvalidCredentialsError", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const authRecord = await setAuthPassword(env, broker.userId, "correct horse battery staple", { pepper: PEPPER });
  const pbkdf2Result = await pbkdf2ResultFor(authRecord, "wrong-password");

  await assert.rejects(
    () => login(env, { identifier: broker.cpf, pbkdf2Result }, SECRETS),
    InvalidCredentialsError,
  );
});

test("login with an unknown CPF fails with the same InvalidCredentialsError", async () => {
  const env = makeEnv();

  await assert.rejects(
    () => login(env, { identifier: nextCpf(), pbkdf2Result: "qualquer-coisa" }, SECRETS),
    InvalidCredentialsError,
  );
});

test("login never reveals whether the failure was the identifier or the password", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const authRecord = await setAuthPassword(env, broker.userId, "correct horse battery staple", { pepper: PEPPER });

  let unknownIdentifierError;
  let wrongPasswordError;
  try {
    await login(env, { identifier: nextCpf(), pbkdf2Result: "x" }, SECRETS);
  } catch (error) {
    unknownIdentifierError = error;
  }
  try {
    await login(
      env,
      { identifier: broker.cpf, pbkdf2Result: await pbkdf2ResultFor(authRecord, "senha-errada") },
      SECRETS,
    );
  } catch (error) {
    wrongPasswordError = error;
  }

  assert.equal(unknownIdentifierError.message, wrongPasswordError.message);
  assert.equal(unknownIdentifierError.name, "InvalidCredentialsError");
  assert.equal(wrongPasswordError.name, "InvalidCredentialsError");
});

test("login fails when the broker exists but has no credential record yet", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);

  await assert.rejects(
    () => login(env, { identifier: broker.cpf, pbkdf2Result: "qualquer-coisa" }, SECRETS),
    InvalidCredentialsError,
  );
});

test("login rejects malformed input without touching storage", async () => {
  const env = makeEnv();
  await assert.rejects(() => login(env, { identifier: "not-a-cpf", pbkdf2Result: "x" }, SECRETS), InvalidCredentialsError);
  await assert.rejects(() => login(env, { identifier: nextCpf(), pbkdf2Result: "" }, SECRETS), InvalidCredentialsError);
});

// --- Etapa 8 (§53): fecha a pendência da Etapa 4 — corretor suspenso ------

test("login rejects a suspended broker with correct credentials, using the same generic error as a wrong password", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env, { status: "suspended" });
  const authRecord = await setAuthPassword(env, broker.userId, "correct horse battery staple", { pepper: PEPPER });

  let suspendedError;
  try {
    await login(
      env,
      { identifier: broker.cpf, pbkdf2Result: await pbkdf2ResultFor(authRecord, "correct horse battery staple") },
      SECRETS,
    );
  } catch (error) {
    suspendedError = error;
  }

  assert.equal(suspendedError.name, "InvalidCredentialsError");
  assert.equal(suspendedError.message, "CPF ou senha inválidos.");
});

test("login rejects a disabled broker the same way", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env, { status: "disabled" });
  const authRecord = await setAuthPassword(env, broker.userId, "correct horse battery staple", { pepper: PEPPER });
  const pbkdf2Result = await pbkdf2ResultFor(authRecord, "correct horse battery staple");

  await assert.rejects(
    () => login(env, { identifier: broker.cpf, pbkdf2Result }, SECRETS),
    InvalidCredentialsError,
  );
});

// --- gestão completa de cliente/site: exclusão lógica bloqueia login ------

test("login rejects a deleted broker the same generic way as suspended/disabled", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env, { status: "active" });
  const authRecord = await setAuthPassword(env, broker.userId, "correct horse battery staple", { pepper: PEPPER });
  await deleteBroker(env, broker.brokerId);

  const pbkdf2Result = await pbkdf2ResultFor(authRecord, "correct horse battery staple");
  await assert.rejects(() => login(env, { identifier: broker.cpf, pbkdf2Result }, SECRETS), InvalidCredentialsError);
});

// --- setAuthPasswordFromClientResult (gestão completa de cliente/site) ---
// A senha inicial que o SuperAdmin cria pra um cliente/site novo — o
// navegador já derivou o PBKDF2 (nunca a senha crua chega até este ponto,
// nem passa pelas 600k iterações dentro do Worker).

test("setAuthPasswordFromClientResult stores the peppered verifier from an already-derived pbkdf2Result, never a plaintext password", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const salt = "dGVzdC1zYWx0LTE2Ynl0ZXM=";
  const pbkdf2Result = await deriveClientPbkdf2("correct horse battery staple", salt, 600_000);

  const record = await setAuthPasswordFromClientResult(env, broker.userId, { salt, pbkdf2Result }, { pepper: PEPPER });

  assert.equal(record.userId, broker.userId);
  assert.equal(record.pbkdf2Salt, salt);
  assert.equal(record.authVersion, 1);
  assert.match(record.verifier, /^hmac-sha256\$/);
  assert.equal(record.verifier.includes(pbkdf2Result), false);
});

test("setAuthPasswordFromClientResult produces a verifier that actually logs in via the normal login flow", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  const salt = "dGVzdC1zYWx0LTE2Ynl0ZXM=";
  const pbkdf2Result = await deriveClientPbkdf2("correct horse battery staple", salt, 600_000);
  await setAuthPasswordFromClientResult(env, broker.userId, { salt, pbkdf2Result }, { pepper: PEPPER });

  const { claims } = await login(env, { identifier: broker.cpf, pbkdf2Result }, SECRETS);
  assert.equal(claims.brokerId, broker.brokerId);
});

test("setAuthPasswordFromClientResult requires salt, pbkdf2Result and pepper", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env);
  await assert.rejects(
    () => setAuthPasswordFromClientResult(env, broker.userId, { pbkdf2Result: "x" }, { pepper: PEPPER }),
    ValidationError,
  );
  await assert.rejects(
    () => setAuthPasswordFromClientResult(env, broker.userId, { salt: "x" }, { pepper: PEPPER }),
    ValidationError,
  );
  await assert.rejects(
    () => setAuthPasswordFromClientResult(env, broker.userId, { salt: "x", pbkdf2Result: "y" }),
    ValidationError,
  );
});

test("login still succeeds for a pending broker (approval doesn't gate login, only suspension does)", async () => {
  const env = makeEnv();
  const broker = await makeBroker(env, { status: "pending" });
  const authRecord = await setAuthPassword(env, broker.userId, "correct horse battery staple", { pepper: PEPPER });

  const { claims } = await login(
    env,
    { identifier: broker.cpf, pbkdf2Result: await pbkdf2ResultFor(authRecord, "correct horse battery staple") },
    SECRETS,
  );
  assert.equal(claims.brokerId, broker.brokerId);
});
