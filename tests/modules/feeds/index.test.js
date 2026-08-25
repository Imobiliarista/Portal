// Unit test for modules/feeds/index.js's own contribution —
// `renderFrontendModuleSource` (§46). The re-exports it wires from
// config.js/registry.js/generator.js are already exercised end-to-end by
// tests/modules/feeds/{config,generator,registry}.test.js; this file only
// covers what's unique to index.js: the generated browser bundle.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderFrontendModuleSource, FEED_SUBMODULES } from "../../../modules/feeds/index.js";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("renderFrontendModuleSource embeds only public metadata for each submodule — never the generate() function", () => {
  const source = renderFrontendModuleSource();
  assert.match(source, /export const FEED_SUBMODULES_PUBLIC/);
  for (const { id, displayName } of Object.values(FEED_SUBMODULES)) {
    assert.match(source, new RegExp(`"id":\\s*"${escapeRegExp(id)}"`));
    assert.match(source, new RegExp(`"displayName":\\s*"${escapeRegExp(displayName)}"`));
  }
  assert.doesNotMatch(source, /generate\s*\(/, "the XML-building generate() function must never reach the browser bundle");
  assert.doesNotMatch(source, /^import /m, "must be a standalone ESM module, no imports");
});

test("renderFrontendModuleSource embeds a working readFeedSubmoduleConfig", async () => {
  const source = renderFrontendModuleSource();
  assert.match(source, /export function readFeedSubmoduleConfig/);

  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = mkdtempSync(join(tmpdir(), "feeds-generated-"));
  const path = join(dir, "feeds.generated.js");
  writeFileSync(path, source);
  const generated = await import(`file://${path}`);

  const broker = { modules: { feeds: { vrsync: { enabled: true } } } };
  assert.deepEqual(generated.readFeedSubmoduleConfig(broker, "vrsync"), { enabled: true });
  assert.deepEqual(generated.readFeedSubmoduleConfig(broker, "unknown-submodule"), { enabled: false });
  assert.deepEqual(generated.readFeedSubmoduleConfig(null, "vrsync"), { enabled: false });
});
