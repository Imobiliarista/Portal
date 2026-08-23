import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCacheControl, CACHE_TTL_SECONDS, purgeEdgeCache } from "../../storage/cache.js";

test("buildCacheControl uses §60 TTL guidance per object kind", () => {
  assert.equal(buildCacheControl("cityManifest"), `public, max-age=${CACHE_TTL_SECONDS.cityManifest}, must-revalidate`);
  assert.equal(buildCacheControl("listingPublic"), `public, max-age=${CACHE_TTL_SECONDS.listingPublic}, must-revalidate`);
});

test("buildCacheControl marks media as immutable with a long TTL (§59)", () => {
  assert.equal(buildCacheControl("media"), `public, max-age=${CACHE_TTL_SECONDS.media}, immutable`);
});

test("buildCacheControl rejects unknown kinds", () => {
  assert.throws(() => buildCacheControl("unknown-kind"));
});

test("purgeEdgeCache is a no-op outside the Workers runtime instead of throwing", async () => {
  const result = await purgeEdgeCache(new Request("https://imobiliarista.net/londrina"));
  assert.equal(result, false);
});
