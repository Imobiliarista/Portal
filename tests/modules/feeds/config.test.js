// modules/feeds/config.js — leitura/validação de `broker.modules.feeds`
// (§46, decisão de opt-in por corretor, Etapa 9).

import { test } from "node:test";
import assert from "node:assert/strict";
import { FEEDS_MODULE_KEY, DEFAULT_FEEDS_CONFIG, readFeedsConfig, validateFeedsConfig } from "../../../modules/feeds/config.js";

test("readFeedsConfig defaults to disabled for a broker that never configured the module", () => {
  assert.deepEqual(readFeedsConfig({}), DEFAULT_FEEDS_CONFIG);
  assert.deepEqual(readFeedsConfig({ modules: {} }), DEFAULT_FEEDS_CONFIG);
  assert.deepEqual(readFeedsConfig(null), DEFAULT_FEEDS_CONFIG);
  assert.deepEqual(readFeedsConfig(undefined), DEFAULT_FEEDS_CONFIG);
});

test("readFeedsConfig reads an explicit enabled:true", () => {
  assert.deepEqual(readFeedsConfig({ modules: { [FEEDS_MODULE_KEY]: { enabled: true } } }), { enabled: true });
});

test("readFeedsConfig never throws on a malformed modules.feeds value", () => {
  assert.deepEqual(readFeedsConfig({ modules: { feeds: "not-an-object" } }), DEFAULT_FEEDS_CONFIG);
  assert.deepEqual(readFeedsConfig({ modules: { feeds: null } }), DEFAULT_FEEDS_CONFIG);
  assert.deepEqual(readFeedsConfig({ modules: { feeds: { enabled: "yes" } } }), { enabled: false });
});

test("validateFeedsConfig accepts a boolean enabled", () => {
  assert.deepEqual(validateFeedsConfig({ enabled: true }), { valid: true, config: { enabled: true } });
  assert.deepEqual(validateFeedsConfig({ enabled: false }), { valid: true, config: { enabled: false } });
});

test("validateFeedsConfig rejects a non-boolean enabled", () => {
  const result = validateFeedsConfig({ enabled: "true" });
  assert.equal(result.valid, false);
  assert.ok(result.error);
});

test("validateFeedsConfig rejects missing input entirely", () => {
  assert.equal(validateFeedsConfig().valid, false);
  assert.equal(validateFeedsConfig({}).valid, false);
});
