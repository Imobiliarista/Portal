// modules/feeds/config.js — leitura/validação de `broker.modules.feeds`,
// um objeto por submódulo (§46, "Modo Exportação", Etapa 9).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FEEDS_MODULE_KEY,
  DEFAULT_FEED_SUBMODULE_CONFIG,
  readFeedSubmoduleConfig,
  validateFeedSubmoduleConfig,
  hasAnyFeedSubmoduleEnabled,
} from "../../../modules/feeds/config.js";

test("readFeedSubmoduleConfig defaults to disabled for a broker that never configured that submodule", () => {
  assert.deepEqual(readFeedSubmoduleConfig({}, "vrsync"), DEFAULT_FEED_SUBMODULE_CONFIG);
  assert.deepEqual(readFeedSubmoduleConfig({ modules: {} }, "vrsync"), DEFAULT_FEED_SUBMODULE_CONFIG);
  assert.deepEqual(readFeedSubmoduleConfig({ modules: { [FEEDS_MODULE_KEY]: {} } }, "vrsync"), DEFAULT_FEED_SUBMODULE_CONFIG);
  assert.deepEqual(readFeedSubmoduleConfig(null, "vrsync"), DEFAULT_FEED_SUBMODULE_CONFIG);
});

test("readFeedSubmoduleConfig reads an explicit enabled:true for the requested submodule only", () => {
  const broker = { modules: { [FEEDS_MODULE_KEY]: { vrsync: { enabled: true } } } };
  assert.deepEqual(readFeedSubmoduleConfig(broker, "vrsync"), { enabled: true });
  assert.deepEqual(readFeedSubmoduleConfig(broker, "outro-submodulo"), DEFAULT_FEED_SUBMODULE_CONFIG);
});

test("readFeedSubmoduleConfig never throws on a malformed modules.feeds[submoduleId] value", () => {
  assert.deepEqual(readFeedSubmoduleConfig({ modules: { feeds: { vrsync: "not-an-object" } } }, "vrsync"), DEFAULT_FEED_SUBMODULE_CONFIG);
  assert.deepEqual(readFeedSubmoduleConfig({ modules: { feeds: { vrsync: null } } }, "vrsync"), DEFAULT_FEED_SUBMODULE_CONFIG);
  assert.deepEqual(readFeedSubmoduleConfig({ modules: { feeds: { vrsync: { enabled: "yes" } } } }, "vrsync"), { enabled: false });
});

test("validateFeedSubmoduleConfig accepts a boolean enabled", () => {
  assert.deepEqual(validateFeedSubmoduleConfig({ enabled: true }), { valid: true, config: { enabled: true } });
  assert.deepEqual(validateFeedSubmoduleConfig({ enabled: false }), { valid: true, config: { enabled: false } });
});

test("validateFeedSubmoduleConfig rejects a non-boolean enabled", () => {
  const result = validateFeedSubmoduleConfig({ enabled: "true" });
  assert.equal(result.valid, false);
  assert.ok(result.error);
});

test("validateFeedSubmoduleConfig rejects missing input entirely", () => {
  assert.equal(validateFeedSubmoduleConfig().valid, false);
  assert.equal(validateFeedSubmoduleConfig({}).valid, false);
});

test("hasAnyFeedSubmoduleEnabled is true when any of the given submodules is enabled", () => {
  const broker = { modules: { [FEEDS_MODULE_KEY]: { vrsync: { enabled: true } } } };
  assert.equal(hasAnyFeedSubmoduleEnabled(broker, ["vrsync"]), true);
  assert.equal(hasAnyFeedSubmoduleEnabled(broker, ["outro-submodulo", "vrsync"]), true);
});

test("hasAnyFeedSubmoduleEnabled is false when none of the given submodules is enabled", () => {
  assert.equal(hasAnyFeedSubmoduleEnabled({}, ["vrsync"]), false);
  const broker = { modules: { [FEEDS_MODULE_KEY]: { vrsync: { enabled: false } } } };
  assert.equal(hasAnyFeedSubmoduleEnabled(broker, ["vrsync"]), false);
});
