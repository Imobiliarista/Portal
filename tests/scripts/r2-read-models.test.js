// scripts/r2-read-models.js — executor oficial (Etapa 5). Guard tests run
// in-process (fast, deterministic); one subprocess smoke test proves the
// real CLI entrypoint works with zero environment variables set. No test
// here ever lets `runPublish` reach a real `fetch()` call — every guard
// test stops at the guard that should reject it, before any credential
// would be used to talk to a real endpoint (Etapa 5 "validate/publish
// guard tests não executam escrita remota").

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runValidate,
  runPublish,
  assertPipelineShape,
  RemoteR2Bucket,
  REQUIRED_CONFIRMATION,
  REQUIRED_ENVIRONMENT,
} from "../../scripts/r2-read-models.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, "..", "..", "scripts", "r2-read-models.js");

function silentLog() {}

// --- validate (in-process) --------------------------------------------

test("runValidate succeeds with zero environment variables set, using only the local fixture", async () => {
  const result = await runValidate({ log: silentLog });
  assert.equal(result.report.planned, 3);
  assert.deepEqual(
    result.plan.targets.map((t) => t.key).sort(),
    ["portal/cities.json", "portal/modules.json", "portal/taxonomy.json"],
  );
});

test("runValidate never touches process.env credentials", async () => {
  const before = { ...process.env };
  await runValidate({ log: silentLog });
  assert.deepEqual(process.env.CLOUDFLARE_API_TOKEN, before.CLOUDFLARE_API_TOKEN);
  assert.deepEqual(process.env.CLOUDFLARE_ACCOUNT_ID, before.CLOUDFLARE_ACCOUNT_ID);
});

// --- assertPipelineShape ---------------------------------------------------

test("assertPipelineShape rejects a result missing a required top-level field", () => {
  assert.throws(() => assertPipelineShape({ enumeration: {}, validation: {}, plan: { targets: [] } }), /campo obrigatório/);
});

test("assertPipelineShape rejects a plan missing one of the 3 canonical keys", () => {
  assert.throws(
    () =>
      assertPipelineShape({
        enumeration: {},
        validation: {},
        plan: { targets: [{ key: "portal/cities.json", action: "create" }] },
        report: {},
      }),
    /esperava 3/,
  );
});

test("assertPipelineShape rejects a plan containing a delete action", () => {
  const targets = [
    { key: "portal/cities.json", action: "delete" },
    { key: "portal/taxonomy.json", action: "create" },
    { key: "portal/modules.json", action: "create" },
  ];
  assert.throws(() => assertPipelineShape({ enumeration: {}, validation: {}, plan: { targets }, report: {} }), /delete/);
});

// --- runPublish guards (in-process, never reaches a real fetch) -----------

test("runPublish rejects a missing confirmation before touching any credential", async () => {
  await assert.rejects(runPublish({ log: silentLog }), /confirma/i);
});

test("runPublish rejects a wrong confirmation literal", async () => {
  await assert.rejects(runPublish({ confirmation: "publicar", log: silentLog }), /confirma/i);
});

test("runPublish rejects when IMOB_R2_ENVIRONMENT is not exactly production-r2", async () => {
  const original = process.env.IMOB_R2_ENVIRONMENT;
  try {
    delete process.env.IMOB_R2_ENVIRONMENT;
    await assert.rejects(runPublish({ confirmation: REQUIRED_CONFIRMATION, log: silentLog }), /IMOB_R2_ENVIRONMENT/);
  } finally {
    if (original === undefined) delete process.env.IMOB_R2_ENVIRONMENT;
    else process.env.IMOB_R2_ENVIRONMENT = original;
  }
});

test("runPublish rejects a missing CLOUDFLARE_API_TOKEN even with confirmation + environment correct", async () => {
  const originalEnv = process.env.IMOB_R2_ENVIRONMENT;
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  try {
    process.env.IMOB_R2_ENVIRONMENT = REQUIRED_ENVIRONMENT;
    delete process.env.CLOUDFLARE_API_TOKEN;
    await assert.rejects(
      runPublish({ confirmation: REQUIRED_CONFIRMATION, log: silentLog }),
      /CLOUDFLARE_API_TOKEN/,
    );
  } finally {
    if (originalEnv === undefined) delete process.env.IMOB_R2_ENVIRONMENT;
    else process.env.IMOB_R2_ENVIRONMENT = originalEnv;
    if (originalToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = originalToken;
  }
});

test("runPublish rejects a missing CLOUDFLARE_ACCOUNT_ID even with token present", async () => {
  const originalEnv = process.env.IMOB_R2_ENVIRONMENT;
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  const originalAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  try {
    process.env.IMOB_R2_ENVIRONMENT = REQUIRED_ENVIRONMENT;
    process.env.CLOUDFLARE_API_TOKEN = "fake-token-never-used-network-not-reached";
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    await assert.rejects(
      runPublish({ confirmation: REQUIRED_CONFIRMATION, log: silentLog }),
      /CLOUDFLARE_ACCOUNT_ID/,
    );
  } finally {
    if (originalEnv === undefined) delete process.env.IMOB_R2_ENVIRONMENT;
    else process.env.IMOB_R2_ENVIRONMENT = originalEnv;
    if (originalToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = originalToken;
    if (originalAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = originalAccount;
  }
});

// --- RemoteR2Bucket (fetch stubbed — no real network) -----------------

test("RemoteR2Bucket has no delete/list capability at all", () => {
  const bucket = new RemoteR2Bucket({ accountId: "acc", apiToken: "tok", bucketName: "imob-data" });
  assert.equal(bucket.delete, undefined);
  assert.equal(bucket.list, undefined);
});

test("RemoteR2Bucket.get builds the official R2 objects URL and sends a Bearer token, never in a log", async () => {
  const bucket = new RemoteR2Bucket({ accountId: "acc123", apiToken: "secret-token-xyz", bucketName: "imob-data" });
  const originalFetch = globalThis.fetch;
  let capturedUrl;
  let capturedHeaders;
  globalThis.fetch = async (url, init) => {
    capturedUrl = url;
    capturedHeaders = init.headers;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await bucket.get("portal/cities.json");
    assert.equal(capturedUrl, "https://api.cloudflare.com/client/v4/accounts/acc123/r2/buckets/imob-data/objects/portal%2Fcities.json");
    assert.equal(capturedHeaders.Authorization, "Bearer secret-token-xyz");
    assert.deepEqual(await result.json(), { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("RemoteR2Bucket.get returns null on 404 (never throws for a missing object)", async () => {
  const bucket = new RemoteR2Bucket({ accountId: "acc", apiToken: "tok", bucketName: "imob-data" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 404 });
  try {
    assert.equal(await bucket.get("portal/cities.json"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("RemoteR2Bucket.put sends the body via PUT with the right content type", async () => {
  const bucket = new RemoteR2Bucket({ accountId: "acc", apiToken: "tok", bucketName: "imob-data" });
  const originalFetch = globalThis.fetch;
  let capturedMethod;
  let capturedBody;
  let capturedContentType;
  globalThis.fetch = async (url, init) => {
    capturedMethod = init.method;
    capturedBody = init.body;
    capturedContentType = init.headers["Content-Type"];
    return new Response(null, { status: 200 });
  };
  try {
    await bucket.put("portal/cities.json", '{"cities":[]}', { httpMetadata: { contentType: "application/json; charset=utf-8" } });
    assert.equal(capturedMethod, "PUT");
    assert.equal(capturedBody, '{"cities":[]}');
    assert.equal(capturedContentType, "application/json; charset=utf-8");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- subprocess smoke test (the real CLI entrypoint) -----------------------

test("CLI `validate` mode exits 0 with zero credentials in the environment", async () => {
  const { stdout } = await execFileAsync("node", [CLI_PATH, "validate"], {
    env: { PATH: process.env.PATH }, // deliberately no CLOUDFLARE_* vars at all
  });
  assert.match(stdout, /Validação OK/);
  assert.match(stdout, /Credenciais usadas: nenhuma/);
});

test("CLI `publish` mode without confirmation exits non-zero and never touches the network", async () => {
  await assert.rejects(
    execFileAsync("node", [CLI_PATH, "publish"], { env: { PATH: process.env.PATH } }),
    (error) => {
      assert.ok(error.code !== 0);
      assert.match(error.stderr, /confirma/i);
      return true;
    },
  );
});

test("CLI with an unknown mode exits non-zero with a usage message", async () => {
  await assert.rejects(
    execFileAsync("node", [CLI_PATH, "nonsense"], { env: { PATH: process.env.PATH } }),
    (error) => {
      assert.ok(error.code !== 0);
      assert.match(error.stderr, /Uso:/);
      return true;
    },
  );
});
