// config/r2/imob-data-cors.json — versioned CORS policy (§80, Etapa 7).
// scripts/validate-r2-cors.js is the reusable validator; these tests cover
// both the pure validator and the actual committed policy file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateCorsPolicy, CORS_POLICY_PATH } from "../../scripts/validate-r2-cors.js";

function loadPolicy() {
  return JSON.parse(readFileSync(CORS_POLICY_PATH, "utf8"));
}

// --- o arquivo versionado real ------------------------------------------

test("config/r2/imob-data-cors.json is valid JSON", () => {
  assert.doesNotThrow(() => loadPolicy());
});

test("the committed policy passes validateCorsPolicy with zero problems", () => {
  const { valid, problems } = validateCorsPolicy(loadPolicy());
  assert.equal(valid, true);
  assert.deepEqual(problems, []);
});

test("the committed policy allows only GET and HEAD", () => {
  const policy = loadPolicy();
  for (const rule of policy) {
    assert.deepEqual([...rule.AllowedMethods].sort(), ["GET", "HEAD"]);
  }
});

test("the committed policy allows public cross-origin reads (portal + any minisite)", () => {
  const policy = loadPolicy();
  assert.deepEqual(policy[0].AllowedOrigins, ["*"]);
});

test("the committed policy exposes only safe, documented headers", () => {
  const policy = loadPolicy();
  assert.deepEqual(policy[0].ExposeHeaders.sort(), ["Cache-Control", "Content-Length", "Content-Type", "ETag"]);
});

// --- o validador puro (independente do arquivo) -----------------------

test("validateCorsPolicy rejects a policy allowing PUT/POST/PATCH/DELETE", () => {
  for (const writeMethod of ["PUT", "POST", "PATCH", "DELETE"]) {
    const { valid, problems } = validateCorsPolicy([{ AllowedOrigins: ["*"], AllowedMethods: ["GET", writeMethod] }]);
    assert.equal(valid, false);
    assert.ok(problems.some((p) => p.includes(writeMethod)));
  }
});

test("validateCorsPolicy rejects an authentication header in AllowedHeaders", () => {
  const { valid, problems } = validateCorsPolicy([
    { AllowedOrigins: ["*"], AllowedMethods: ["GET", "HEAD"], AllowedHeaders: ["Authorization"] },
  ]);
  assert.equal(valid, false);
  assert.ok(problems.some((p) => p.toLowerCase().includes("authorization")));
});

test("validateCorsPolicy rejects an origin that looks like a private bucket/domain", () => {
  const { valid, problems } = validateCorsPolicy([
    { AllowedOrigins: ["https://imob-private.example"], AllowedMethods: ["GET", "HEAD"] },
  ]);
  assert.equal(valid, false);
  assert.ok(problems.some((p) => p.includes("privado")));
});

test("validateCorsPolicy rejects an empty/malformed policy array", () => {
  assert.equal(validateCorsPolicy([]).valid, false);
  assert.equal(validateCorsPolicy(null).valid, false);
  assert.equal(validateCorsPolicy({}).valid, false);
});

test("validateCorsPolicy accepts a minimal valid GET/HEAD-only policy", () => {
  const { valid } = validateCorsPolicy([{ AllowedOrigins: ["*"], AllowedMethods: ["GET", "HEAD"] }]);
  assert.equal(valid, true);
});
