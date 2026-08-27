// .github/workflows/publish-r2-read-models.yml — static audit (Etapa 10).
// No YAML parser dependency exists in this project (only `wrangler` is a
// devDependency) — a text-based structural check is enough to catch the
// guards this workflow must never lose, and matches this repo's existing
// preference for the simplest thing that works (§94).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = path.join(__dirname, "..", "..", ".github", "workflows", "publish-r2-read-models.yml");

let source;
let sourceWithoutComments;

test.before(async () => {
  source = await readFile(WORKFLOW_PATH, "utf8");
  // Explanatory `#` comments legitimately mention forbidden commands in
  // prose (e.g. "nunca roda `wrangler deploy`") — the behavioral checks
  // below care about what actually RUNS, so they search this
  // comment-stripped copy instead of the raw source.
  sourceWithoutComments = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
});

test("triggers only on workflow_dispatch — never push/pull_request", () => {
  assert.match(source, /^on:\s*\n\s*workflow_dispatch:/m);
  assert.doesNotMatch(source, /^\s*push:/m);
  assert.doesNotMatch(source, /^\s*pull_request:/m);
});

test("workflow_dispatch exposes mode (choice validate/publish) and a free-text confirmation input", () => {
  assert.match(source, /mode:[\s\S]*?type: choice[\s\S]*?options:[\s\S]*?- validate[\s\S]*?- publish/);
  assert.match(source, /confirmation:[\s\S]*?type: string/);
});

test("publish job depends on validate", () => {
  const publishJob = source.split(/^\s{2}publish:/m)[1];
  assert.ok(publishJob, "publish job not found");
  assert.match(publishJob, /needs: validate/);
});

test("publish job's if-condition requires mode=publish, confirmation=PUBLICAR_R2 and ref=refs/heads/main", () => {
  const publishJob = source.split(/^\s{2}publish:/m)[1];
  const ifBlock = publishJob.match(/if: \|([\s\S]*?)\n\s{4}runs-on:/)[1];
  assert.match(ifBlock, /inputs\.mode == 'publish'/);
  assert.match(ifBlock, /inputs\.confirmation == 'PUBLICAR_R2'/);
  assert.match(ifBlock, /github\.ref == 'refs\/heads\/main'/);
});

test("publish job uses the production-r2 Environment", () => {
  const publishJob = source.split(/^\s{2}publish:/m)[1];
  assert.match(publishJob, /environment: production-r2/);
});

test("CLOUDFLARE_API_TOKEN/ACCOUNT_ID only appear in the publish job, never in validate", () => {
  const [beforePublish, publishJob] = source.split(/^\s{2}publish:/m);
  assert.doesNotMatch(beforePublish, /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(beforePublish, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(publishJob, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(publishJob, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}/);
});

test("validate job never declares an `environment:` (no protected-environment secrets available to it)", () => {
  const validateJob = source.split(/^\s{2}validate:/m)[1].split(/^\s{2}publish:/m)[0];
  assert.doesNotMatch(validateJob, /environment:/);
});

test("neither job ever runs `wrangler deploy`, `wrangler versions upload`, or `wrangler whoami`", () => {
  assert.doesNotMatch(sourceWithoutComments, /wrangler deploy/);
  assert.doesNotMatch(sourceWithoutComments, /wrangler versions upload/);
  assert.doesNotMatch(sourceWithoutComments, /wrangler whoami/);
});

test("no step ever invokes an actual delete/remove/purge operation (prose mentioning the guarantee is fine)", () => {
  assert.doesNotMatch(sourceWithoutComments, /wrangler r2 object delete/i);
  assert.doesNotMatch(sourceWithoutComments, /--method[= ]DELETE/i);
  assert.doesNotMatch(sourceWithoutComments, /\brm -rf\b/);
  assert.doesNotMatch(sourceWithoutComments, /deletePublic|deletePrivate/);
  assert.doesNotMatch(sourceWithoutComments, /\bpurge\b/i);
});

test("concurrency uses cancel-in-progress: false", () => {
  assert.match(source, /concurrency:\s*\n\s*group: imob-r2-read-models[\s\S]*?cancel-in-progress: false/);
});

test("top-level permissions are read-only on contents", () => {
  assert.match(source, /^permissions:\s*\n\s*contents: read\s*$/m);
});

test("publish job runs r2-read-models:validate before r2-read-models:publish", () => {
  const publishJob = source.split(/^\s{2}publish:/m)[1];
  const validateIndex = publishJob.indexOf("r2-read-models:validate");
  const publishIndex = publishJob.indexOf("r2-read-models:publish");
  assert.ok(validateIndex > -1 && publishIndex > -1);
  assert.ok(validateIndex < publishIndex, "validate must run before publish within the publish job");
});

test("both jobs write to $GITHUB_STEP_SUMMARY", () => {
  const occurrences = source.match(/GITHUB_STEP_SUMMARY/g) ?? [];
  assert.ok(occurrences.length >= 2);
});
