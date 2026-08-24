import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PUBLICATIONS_MODULE_KEY,
  DEFAULT_PUBLICATIONS_CONFIG,
  isHttpUrl,
  readPublicationsConfig,
  validatePublicationsConfig,
} from "../../../modules/publications/config.js";

test("PUBLICATIONS_MODULE_KEY matches broker.modules key from §47", () => {
  assert.equal(PUBLICATIONS_MODULE_KEY, "publications");
});

test("isHttpUrl accepts http(s), rejects everything else", () => {
  assert.equal(isHttpUrl("https://fulano.blogspot.com/feeds/posts/default"), true);
  assert.equal(isHttpUrl("http://fulano.blogspot.com"), true);
  assert.equal(isHttpUrl("ftp://example.com"), false);
  assert.equal(isHttpUrl("not a url"), false);
  assert.equal(isHttpUrl(""), false);
  assert.equal(isHttpUrl(null), false);
  assert.equal(isHttpUrl(undefined), false);
  assert.equal(isHttpUrl(123), false);
});

test("readPublicationsConfig returns the default for a broker without modules", () => {
  assert.deepEqual(readPublicationsConfig({}), DEFAULT_PUBLICATIONS_CONFIG);
  assert.deepEqual(readPublicationsConfig(null), DEFAULT_PUBLICATIONS_CONFIG);
  assert.deepEqual(readPublicationsConfig(undefined), DEFAULT_PUBLICATIONS_CONFIG);
});

test("readPublicationsConfig returns the default when modules.publications is absent/malformed", () => {
  assert.deepEqual(readPublicationsConfig({ modules: {} }), DEFAULT_PUBLICATIONS_CONFIG);
  assert.deepEqual(readPublicationsConfig({ modules: { publications: null } }), DEFAULT_PUBLICATIONS_CONFIG);
  assert.deepEqual(readPublicationsConfig({ modules: { publications: "nope" } }), DEFAULT_PUBLICATIONS_CONFIG);
});

test("readPublicationsConfig reads a valid enabled config", () => {
  const broker = { modules: { publications: { enabled: true, feedUrl: "https://fulano.blogspot.com/feeds/posts/default" } } };
  assert.deepEqual(readPublicationsConfig(broker), {
    enabled: true,
    feedUrl: "https://fulano.blogspot.com/feeds/posts/default",
  });
});

test("readPublicationsConfig never reports enabled without a valid feedUrl (§49-style: componente não renderiza)", () => {
  assert.deepEqual(readPublicationsConfig({ modules: { publications: { enabled: true, feedUrl: null } } }), {
    enabled: false,
    feedUrl: null,
  });
  assert.deepEqual(readPublicationsConfig({ modules: { publications: { enabled: true, feedUrl: "garbage" } } }), {
    enabled: false,
    feedUrl: null,
  });
});

test("readPublicationsConfig ignores other modules stored alongside publications", () => {
  const broker = {
    modules: {
      publications: { enabled: true, feedUrl: "https://fulano.blogspot.com/feeds/posts/default" },
      someOtherModule: { anything: true },
    },
  };
  assert.deepEqual(readPublicationsConfig(broker), {
    enabled: true,
    feedUrl: "https://fulano.blogspot.com/feeds/posts/default",
  });
});

test("validatePublicationsConfig rejects a non-boolean enabled", () => {
  assert.equal(validatePublicationsConfig({ enabled: "true", feedUrl: null }).valid, false);
  assert.equal(validatePublicationsConfig({}).valid, false);
});

test("validatePublicationsConfig rejects an invalid feedUrl", () => {
  const result = validatePublicationsConfig({ enabled: false, feedUrl: "not a url" });
  assert.equal(result.valid, false);
  assert.match(result.error, /feedUrl/);
});

test("validatePublicationsConfig rejects enabled:true without a feedUrl", () => {
  const result = validatePublicationsConfig({ enabled: true, feedUrl: null });
  assert.equal(result.valid, false);
  assert.match(result.error, /blog/);
});

test("validatePublicationsConfig accepts enabled:false regardless of feedUrl (disable without losing the configured feed)", () => {
  assert.deepEqual(validatePublicationsConfig({ enabled: false, feedUrl: null }), {
    valid: true,
    config: { enabled: false, feedUrl: null },
  });
  assert.deepEqual(validatePublicationsConfig({ enabled: false, feedUrl: "https://fulano.blogspot.com/feeds/posts/default" }), {
    valid: true,
    config: { enabled: false, feedUrl: "https://fulano.blogspot.com/feeds/posts/default" },
  });
});

test("validatePublicationsConfig accepts enabled:true with a valid feedUrl", () => {
  assert.deepEqual(validatePublicationsConfig({ enabled: true, feedUrl: "https://fulano.blogspot.com/feeds/posts/default" }), {
    valid: true,
    config: { enabled: true, feedUrl: "https://fulano.blogspot.com/feeds/posts/default" },
  });
});
