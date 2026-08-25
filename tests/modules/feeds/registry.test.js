// modules/feeds/registry.js — "Modo Exportação" registry (§46, Etapa 9).

import { test } from "node:test";
import assert from "node:assert/strict";
import { FEED_SUBMODULES, FEED_SUBMODULE_IDS } from "../../../modules/feeds/registry.js";

test("registry exposes exactly the vrsync submodule this lot implements", () => {
  assert.deepEqual(FEED_SUBMODULE_IDS, ["vrsync"]);
});

test("the vrsync entry has the minimum shape every submodule must expose", () => {
  const vrsync = FEED_SUBMODULES.vrsync;
  assert.equal(vrsync.id, "vrsync");
  assert.equal(typeof vrsync.displayName, "string");
  assert.ok(vrsync.displayName.length > 0);
  assert.equal(typeof vrsync.generate, "function");
  assert.equal(vrsync.fileName, "vrsync");
  assert.equal(vrsync.contentType, "application/xml; charset=utf-8");
});

test("vrsync.generate(items, header) returns a string", () => {
  const header = { provider: "X", email: "x@x.com", contactName: "X", publishDate: "2026-01-01T00:00:00.000Z", telephone: null };
  const xml = FEED_SUBMODULES.vrsync.generate([], header);
  assert.equal(typeof xml, "string");
  assert.match(xml, /^<\?xml/);
});
