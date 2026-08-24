import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseYoutubeId,
  buildEmbedUrl,
  renderFrontendModuleSource,
} from "../../../modules/video-youtube/index.js";

test("parseYoutubeId extracts the id from a youtube.com/watch?v= URL", () => {
  assert.equal(parseYoutubeId("https://www.youtube.com/watch?v=abc123"), "abc123");
});

test("parseYoutubeId extracts the id from a youtu.be short URL", () => {
  assert.equal(parseYoutubeId("https://youtu.be/abc123"), "abc123");
});

test("parseYoutubeId accepts a bare id", () => {
  assert.equal(parseYoutubeId("abc123"), "abc123");
});

test("parseYoutubeId trims surrounding whitespace", () => {
  assert.equal(parseYoutubeId("  abc123  "), "abc123");
});

test("parseYoutubeId returns null for an empty/blank field", () => {
  assert.equal(parseYoutubeId(""), null);
  assert.equal(parseYoutubeId("   "), null);
  assert.equal(parseYoutubeId(undefined), null);
  assert.equal(parseYoutubeId(null), null);
});

test("parseYoutubeId returns null for a non-youtube URL", () => {
  assert.equal(parseYoutubeId("https://vimeo.com/12345"), null);
});

test("parseYoutubeId returns null for garbage that isn't a URL nor a plausible id", () => {
  assert.equal(parseYoutubeId("!!"), null);
});

test("parseYoutubeId returns null when youtube.com URL has no v= param", () => {
  assert.equal(parseYoutubeId("https://www.youtube.com/embed/"), null);
});

test("buildEmbedUrl builds the iframe embed URL using the youtube-nocookie.com privacy-enhanced domain", () => {
  assert.equal(buildEmbedUrl("abc123"), "https://www.youtube-nocookie.com/embed/abc123");
});

test("buildEmbedUrl URL-encodes the id", () => {
  assert.equal(buildEmbedUrl("a b/c"), "https://www.youtube-nocookie.com/embed/a%20b%2Fc");
});

test("renderFrontendModuleSource embeds both functions as a standalone ESM module", () => {
  const source = renderFrontendModuleSource();
  assert.match(source, /export function parseYoutubeId/);
  assert.match(source, /export function buildEmbedUrl/);
  assert.doesNotMatch(source, /^import /m);
});

test("renderFrontendModuleSource output is loadable and behaves identically to the source functions", async () => {
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = mkdtempSync(join(tmpdir(), "video-youtube-generated-"));
  const path = join(dir, "video-youtube.generated.js");
  writeFileSync(path, renderFrontendModuleSource());

  const generated = await import(`file://${path}`);
  assert.equal(generated.parseYoutubeId("https://youtu.be/xyz789"), "xyz789");
  assert.equal(generated.buildEmbedUrl("xyz789"), "https://www.youtube-nocookie.com/embed/xyz789");
});
