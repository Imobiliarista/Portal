// tests/worker/bootstrap.test.js
//
// POST /api/admin/bootstrap-special-accounts (worker/bootstrap.js) — the
// HTTP alternative to scripts/bootstrap-special-accounts.js for
// provisioning MASTER/TESTE (§27 hotfix pt.2, docs/OPERATIONS.md item 18).
// Focus: every guard the route's own header describes actually holds —
// missing/wrong secret is indistinguishable from a 404 (never a 401/403
// that would confirm the route exists), an already-provisioned account is
// never silently overwritten, the password rule is the shared one (not
// reimplemented here), and the password itself never surfaces in a
// response body or a console.log/error call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleBootstrapSpecialAccounts } from "../../worker/bootstrap.js";
import { login, getSaltForIdentifier, InvalidCredentialsError } from "../../business/auth.js";
import { deriveClientPbkdf2 } from "../../core/auth.js";
import { resolveSpecialLogin } from "../../storage/indexes.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";

const SESSION_SECRET = "test-session-secret-do-not-use-in-prod";
const PASSWORD_PEPPER = "test-pepper-do-not-use-in-prod";
const LOGIN_INDEX_SECRET = "test-login-index-secret-do-not-use-in-prod";
const BOOTSTRAP_SECRET = "test-bootstrap-secret-do-not-use-in-prod";
const SECRETS = { sessionSecret: SESSION_SECRET, pepper: PASSWORD_PEPPER, loginIndexSecret: LOGIN_INDEX_SECRET };

function makeEnv({ withBootstrapSecret = true } = {}) {
  return {
    IMOB_PRIVATE: new FakeR2Bucket(),
    SESSION_SECRET,
    PASSWORD_PEPPER,
    LOGIN_INDEX_SECRET,
    ...(withBootstrapSecret ? { SUPERADMIN_BOOTSTRAP_SECRET: BOOTSTRAP_SECRET } : {}),
  };
}

function bootstrapRequest(bodyObj, { ip = "203.0.113.7" } = {}) {
  return new Request("https://admin.imobiliarista.net/api/admin/bootstrap-special-accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(ip ? { "CF-Connecting-IP": ip } : {}) },
    body: JSON.stringify(bodyObj),
  });
}

// Mirrors the real browser flow: fetch the (real) salt, derive locally,
// then log in — never fabricates claims/verifiers directly.
async function attemptLogin(env, identifier, password) {
  const saltPayload = await getSaltForIdentifier(env, identifier, {
    pepper: PASSWORD_PEPPER,
    loginIndexSecret: LOGIN_INDEX_SECRET,
  });
  const pbkdf2Result = await deriveClientPbkdf2(password, saltPayload.salt, saltPayload.iterations);
  return login(env, { identifier, pbkdf2Result }, SECRETS);
}

test("without SUPERADMIN_BOOTSTRAP_SECRET configured, responds 404 without reading the body or touching R2", async () => {
  const env = makeEnv({ withBootstrapSecret: false });
  const r2 = env.IMOB_PRIVATE;
  const response = await handleBootstrapSpecialAccounts(
    bootstrapRequest({ secret: "anything", accounts: { master: { password: "12345678" } } }),
    env,
  );
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.deepEqual(body, { ok: false, error: { code: "not_found", message: "Rota não encontrada." } });
  assert.equal(r2.store.size, 0); // Guard 1 short-circuits before any R2 read/write, same as a genuinely unmatched route
});

test("with the secret configured but the wrong secret sent, responds 404 (not 401/403)", async () => {
  const env = makeEnv();
  const response = await handleBootstrapSpecialAccounts(
    bootstrapRequest({ secret: "wrong-guess", accounts: { master: { password: "12345678" } } }),
    env,
  );
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.deepEqual(body, { ok: false, error: { code: "not_found", message: "Rota não encontrada." } });
});

test("malformed JSON body also responds 404, same as a wrong/missing secret", async () => {
  const env = makeEnv();
  const request = new Request("https://admin.imobiliarista.net/api/admin/bootstrap-special-accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not-json",
  });
  const response = await handleBootstrapSpecialAccounts(request, env);
  assert.equal(response.status, 404);
});

test("with the correct secret, provisions MASTER and TESTE and both can log in afterwards", async () => {
  const env = makeEnv();
  const response = await handleBootstrapSpecialAccounts(
    bootstrapRequest({
      secret: BOOTSTRAP_SECRET,
      accounts: { master: { password: "senha-master-12345" }, teste: { password: "senha-teste-12345" } },
    }),
    env,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.master, "provisioned");
  assert.equal(body.data.teste, "provisioned");
  assert.equal(typeof body.data.brokerId, "string");
  assert.ok(body.data.brokerId.length > 0);

  const masterLogin = await attemptLogin(env, "MASTER", "senha-master-12345");
  assert.equal(masterLogin.claims.role, "superadmin");
  assert.equal(masterLogin.claims.brokerId, undefined);

  const testeLogin = await attemptLogin(env, "TESTE", "senha-teste-12345");
  assert.equal(testeLogin.claims.role, "broker");
  assert.equal(testeLogin.claims.brokerId, body.data.brokerId);
});

test("calling again without force after already provisioned returns 409 and leaves the account unchanged", async () => {
  const env = makeEnv();
  await handleBootstrapSpecialAccounts(
    bootstrapRequest({ secret: BOOTSTRAP_SECRET, accounts: { master: { password: "senha-original-123" } } }),
    env,
  );

  const secondAttempt = await handleBootstrapSpecialAccounts(
    bootstrapRequest({ secret: BOOTSTRAP_SECRET, accounts: { master: { password: "senha-nova-12345" } } }),
    env,
  );
  assert.equal(secondAttempt.status, 409);
  const body = await secondAttempt.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "conflict");

  // Still the original password — the conflicting call never touched it.
  const loginWithOriginal = await attemptLogin(env, "MASTER", "senha-original-123");
  assert.equal(loginWithOriginal.claims.role, "superadmin");
  await assert.rejects(() => attemptLogin(env, "MASTER", "senha-nova-12345"), InvalidCredentialsError);
});

test("force: true is required to reprovision, and does overwrite when sent", async () => {
  const env = makeEnv();
  await handleBootstrapSpecialAccounts(
    bootstrapRequest({ secret: BOOTSTRAP_SECRET, accounts: { master: { password: "senha-original-123" } } }),
    env,
  );

  const forced = await handleBootstrapSpecialAccounts(
    bootstrapRequest({
      secret: BOOTSTRAP_SECRET,
      force: true,
      accounts: { master: { password: "senha-substituta-123" } },
    }),
    env,
  );
  assert.equal(forced.status, 200);

  await assert.rejects(() => attemptLogin(env, "MASTER", "senha-original-123"), InvalidCredentialsError);
  const loginWithNew = await attemptLogin(env, "MASTER", "senha-substituta-123");
  assert.equal(loginWithNew.claims.role, "superadmin");
});

test("a password shorter than 8 characters is rejected with the same message core/auth.js already uses", async () => {
  const env = makeEnv();
  const response = await handleBootstrapSpecialAccounts(
    bootstrapRequest({ secret: BOOTSTRAP_SECRET, accounts: { master: { password: "short" } } }),
    env,
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.message, "Senha deve ter ao menos 8 caracteres.");

  assert.equal(await resolveSpecialLogin(env, "master"), null); // no record was ever created
});

test("the password never appears in the HTTP response body nor in any console.log/error call", async () => {
  const env = makeEnv();
  const password = "senha-super-secreta-42";
  const originalLog = console.log;
  const originalError = console.error;
  const captured = [];
  console.log = (...args) => captured.push(args);
  console.error = (...args) => captured.push(args);

  let response;
  try {
    response = await handleBootstrapSpecialAccounts(
      bootstrapRequest({ secret: BOOTSTRAP_SECRET, accounts: { master: { password } } }),
      env,
    );
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  const bodyText = await response.text();
  assert.ok(!bodyText.includes(password));
  const loggedText = JSON.stringify(captured);
  assert.ok(!loggedText.includes(password));
});

test("missing accounts entirely is a 400, not a silent no-op", async () => {
  const env = makeEnv();
  const response = await handleBootstrapSpecialAccounts(bootstrapRequest({ secret: BOOTSTRAP_SECRET }), env);
  assert.equal(response.status, 400);
});

test("repeated attempts from the same IP eventually get rate-limited, even with the correct secret", async () => {
  const env = makeEnv();
  const ip = "198.51.100.9";

  // Each of these has the correct secret but no "accounts" (400), which
  // still counts against the per-IP-per-day limit — same as a real guessing
  // script would trigger regardless of whether any single guess is right.
  let lastStatus;
  for (let i = 0; i < 10; i += 1) {
    const response = await handleBootstrapSpecialAccounts(bootstrapRequest({ secret: BOOTSTRAP_SECRET }, { ip }), env);
    lastStatus = response.status;
  }
  assert.equal(lastStatus, 400); // still under the limit through the 10th attempt

  const eleventh = await handleBootstrapSpecialAccounts(
    bootstrapRequest({ secret: BOOTSTRAP_SECRET, accounts: { master: { password: "12345678" } } }, { ip }),
    env,
  );
  assert.equal(eleventh.status, 404); // rate-limited — behaves as if the route didn't exist, even with a valid request
});
