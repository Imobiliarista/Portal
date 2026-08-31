// End-to-end auth wiring (§83 "testes privados: login, sessão, tenant
// isolation"). Unlike tests/business/auth.test.js and tests/core/session.js
// (unit-level), this file exercises the full chain a real /api/* request
// goes through: HTTP handler -> business/auth -> core/session -> the
// worker/auth.js middleware a private handler would call next -> core/tenant
// -> core/permissions.
//
// §27 hotfix (PR #19): the HTTP login request body carries `identifier`
// (a CPF) + `pbkdf2Result` — the PBKDF2 derivation itself runs in the
// browser against the salt from POST /api/auth/salt, never here. Tests
// below reproduce that by deriving locally with core/auth.js's
// deriveClientPbkdf2, the same primitive frontend/painel/auth.js uses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleLogin, handleLogout, getSession, requireSession, requireTenant } from "../../worker/auth.js";
import { login, setAuthPassword } from "../../business/auth.js";
import { createBroker, deleteBroker } from "../../business/brokers.js";
import { deriveClientPbkdf2 } from "../../core/auth.js";
import { createListing, updateListing } from "../../business/listings.js";
import { SESSION_COOKIE_NAME, createSessionToken, UnauthorizedError } from "../../core/session.js";
import { assertTenantMatch, TenantMismatchError } from "../../core/tenant.js";
import { requireRole, ROLES, ForbiddenError } from "../../core/permissions.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";
import { nextCpf } from "../support/cpf.js";

const SESSION_SECRET = "test-session-secret-do-not-use-in-prod";
const PASSWORD_PEPPER = "test-pepper-do-not-use-in-prod";
const LOGIN_INDEX_SECRET = "test-login-index-secret-do-not-use-in-prod";
const SECRETS = { sessionSecret: SESSION_SECRET, pepper: PASSWORD_PEPPER, loginIndexSecret: LOGIN_INDEX_SECRET };

function makeEnv() {
  return {
    IMOB_PRIVATE: new FakeR2Bucket(),
    SESSION_SECRET,
    PASSWORD_PEPPER,
    LOGIN_INDEX_SECRET,
  };
}

async function makeBroker(env, overrides = {}) {
  const broker = await createBroker(
    env,
    {
      userId: overrides.userId ?? "user_000789",
      slug: overrides.slug ?? "joao",
      name: overrides.name ?? "João Imóveis",
      plan: "premium",
      cpf: overrides.cpf ?? nextCpf(),
    },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
  const authRecord = await setAuthPassword(env, broker.userId, overrides.password ?? "correct horse battery staple", {
    pepper: PASSWORD_PEPPER,
  });
  return { broker, authRecord };
}

/** Mirrors the browser: derive the PBKDF2 result locally against the record's real salt. */
async function pbkdf2ResultFor(authRecord, password) {
  return deriveClientPbkdf2(password, authRecord.pbkdf2Salt, authRecord.pbkdf2Iterations);
}

function loginRequest(identifier, pbkdf2Result) {
  return new Request("https://painel.imobiliarista.net/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, pbkdf2Result }),
  });
}

function requestWithCookie(cookieValue) {
  return new Request("https://painel.imobiliarista.net/api/me", {
    headers: cookieValue ? { Cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` } : {},
  });
}

test("POST /api/auth/login succeeds with correct credentials and sets a session cookie", async () => {
  const env = makeEnv();
  const { broker, authRecord } = await makeBroker(env);

  const response = await handleLogin(
    loginRequest(broker.cpf, await pbkdf2ResultFor(authRecord, "correct horse battery staple")),
    env,
  );
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.brokerId, broker.brokerId);
  assert.equal(body.data.slug, "joao");

  const setCookie = response.headers.get("Set-Cookie");
  assert.match(setCookie, new RegExp(`^${SESSION_COOKIE_NAME}=`));
  assert.match(setCookie, /HttpOnly/);
});

test("POST /api/auth/login fails with a wrong password (generic 401, never plaintext-compared)", async () => {
  const env = makeEnv();
  const { broker, authRecord } = await makeBroker(env);

  const response = await handleLogin(loginRequest(broker.cpf, await pbkdf2ResultFor(authRecord, "senha-errada")), env);
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "unauthorized");
});

test("POST /api/auth/login fails with an unknown CPF using the exact same response shape", async () => {
  const env = makeEnv();

  const response = await handleLogin(loginRequest(nextCpf(), "qualquer-coisa"), env);
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.code, "unauthorized");
});

test("POST /api/auth/login rejects malformed JSON with a 400, not a 500", async () => {
  const env = makeEnv();
  const request = new Request("https://painel.imobiliarista.net/api/auth/login", {
    method: "POST",
    body: "{not-json",
  });

  const response = await handleLogin(request, env);
  assert.equal(response.status, 400);
});

test("POST /api/auth/logout expires the session cookie (stateless — no server-side revocation)", async () => {
  const response = await handleLogout();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Set-Cookie"), /Max-Age=0/);
});

test("getSession/requireSession accept a session minted by a real login", async () => {
  const env = makeEnv();
  const { broker, authRecord } = await makeBroker(env);

  const loginResponse = await handleLogin(
    loginRequest(broker.cpf, await pbkdf2ResultFor(authRecord, "correct horse battery staple")),
    env,
  );
  const token = loginResponse.headers.get("Set-Cookie").split(";")[0].split("=").slice(1).join("=");

  const request = requestWithCookie(token);
  const session = await getSession(request, env);
  assert.equal(session.brokerId, broker.brokerId);

  const { session: sameSession, tenant } = await requireTenant(request, env);
  assert.equal(sameSession.brokerId, broker.brokerId);
  assert.deepEqual(tenant, { brokerId: broker.brokerId, slug: "joao" });
});

// Gestão completa de cliente/site: a already-issued session must stop
// working the moment a superadmin marks the broker "deleted" — sessions
// are stateless (§28), so requireTenant re-checks the broker's live
// status on every private request instead (mirrors the existing
// suspended/disabled behavior, worker/auth.js#BLOCKED_TENANT_STATUSES).
test("requireTenant blocks a still-valid session once its broker is deleted mid-use", async () => {
  const env = makeEnv();
  const { broker, authRecord } = await makeBroker(env);

  const loginResponse = await handleLogin(
    loginRequest(broker.cpf, await pbkdf2ResultFor(authRecord, "correct horse battery staple")),
    env,
  );
  const token = loginResponse.headers.get("Set-Cookie").split(";")[0].split("=").slice(1).join("=");
  const request = requestWithCookie(token);

  await deleteBroker(env, broker.brokerId);

  await assert.rejects(() => requireTenant(request, env), ForbiddenError);
});

test("getSession returns null and requireSession throws UnauthorizedError without a cookie", async () => {
  const env = makeEnv();
  const request = requestWithCookie(null);

  assert.equal(await getSession(request, env), null);
  await assert.rejects(() => requireSession(request, env), UnauthorizedError);
});

test("requireSession rejects an expired session (§28 TTL already enforced by core/session.js)", async () => {
  const env = makeEnv();
  const expiredToken = await createSessionToken({ userId: "u1", brokerId: "b1", role: "broker" }, SESSION_SECRET, {
    ttlSeconds: -10,
  });

  await assert.rejects(() => requireSession(requestWithCookie(expiredToken), env), UnauthorizedError);
});

test("requireSession rejects a tampered session cookie", async () => {
  const env = makeEnv();
  const token = await createSessionToken({ userId: "u1", brokerId: "b1", role: "broker" }, SESSION_SECRET);
  const [payload, signature] = token.split(".");
  const tampered = `${payload}x.${signature}`;

  await assert.rejects(() => requireSession(requestWithCookie(tampered), env), UnauthorizedError);
});

test("cross-tenant write is blocked even with a valid session for a different broker (§55)", async () => {
  const env = makeEnv();
  const { broker: brokerA, authRecord: authRecordA } = await makeBroker(env, { userId: "user_a", slug: "joao" });
  const { broker: brokerB } = await makeBroker(env, { userId: "user_b", slug: "maria" });

  const listingB = await createListing(env, brokerB.brokerId, {
    city: "londrina",
    slug: "apartamento-da-maria",
    title: "Apartamento da Maria",
    purpose: "venda",
    type: "apartamento",
    price: 300000,
    features: { bedrooms: 2, bathrooms: 1, parkingSpaces: 1, livingArea: 60 },
  });

  const { claims: sessionA } = await login(
    env,
    { identifier: brokerA.cpf, pbkdf2Result: await pbkdf2ResultFor(authRecordA, "correct horse battery staple") },
    SECRETS,
  );

  assert.throws(() => assertTenantMatch(sessionA, listingB.brokerId), TenantMismatchError);
  await assert.rejects(
    () => updateListing(env, sessionA.brokerId, listingB.listingId, { title: "Sequestrado" }),
    TenantMismatchError,
  );
});

test("superadmin session is exempt from tenant isolation (§53) but broker role still can't self-escalate", async () => {
  const superadminSession = { userId: "user_admin", role: "superadmin" };
  assert.doesNotThrow(() => assertTenantMatch(superadminSession, "broker_qualquer"));
  assert.doesNotThrow(() => requireRole(superadminSession, ROLES.SUPERADMIN));

  const brokerSession = { userId: "user_1", brokerId: "broker_1", role: "broker" };
  assert.throws(() => requireRole(brokerSession, ROLES.SUPERADMIN), ForbiddenError);
});
