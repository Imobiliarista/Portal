import { test } from "node:test";
import assert from "node:assert/strict";
import { getPublic, putPublic, deletePublic } from "../../storage/public.js";
import { FakeR2Bucket } from "./fake-r2-bucket.js";

function makeEnv() {
  return { IMOB_DATA: new FakeR2Bucket() };
}

test("putPublic + getPublic round-trip JSON with cacheControl metadata", async () => {
  const env = makeEnv();
  await putPublic(env, "cities/londrina/manifest.json", { totalListings: 0 }, {
    cacheControl: "public, max-age=60, must-revalidate",
  });

  const value = await getPublic(env, "cities/londrina/manifest.json");
  assert.deepEqual(value, { totalListings: 0 });

  const head = await env.IMOB_DATA.head("cities/londrina/manifest.json");
  assert.equal(head.httpMetadata.cacheControl, "public, max-age=60, must-revalidate");
  assert.equal(head.httpMetadata.contentType, "application/json; charset=utf-8");
});

test("getPublic returns null for a missing key", async () => {
  const env = makeEnv();
  assert.equal(await getPublic(env, "cities/curitiba/manifest.json"), null);
});

test("deletePublic removes the object (§64 remoção/tombstone flow)", async () => {
  const env = makeEnv();
  await putPublic(env, "listings/apartamento-1.json", { status: "sold" });
  await deletePublic(env, "listings/apartamento-1.json");
  assert.equal(await getPublic(env, "listings/apartamento-1.json"), null);
});

test("throws a clear error when the IMOB_DATA binding is missing", async () => {
  await assert.rejects(() => getPublic({}, "x.json"), /IMOB_DATA/);
});
