import { test } from "node:test";
import assert from "node:assert/strict";
import { getPrivate, putPrivate, deletePrivate, listPrivate } from "../../storage/private.js";
import { FakeR2Bucket } from "./fake-r2-bucket.js";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket() };
}

test("putPrivate + getPrivate round-trip JSON", async () => {
  const env = makeEnv();
  await putPrivate(env, "brokers/broker_1/manifest.json", { brokerId: "broker_1", status: "active" });
  const value = await getPrivate(env, "brokers/broker_1/manifest.json");
  assert.deepEqual(value, { brokerId: "broker_1", status: "active" });
});

test("getPrivate returns null for a missing key", async () => {
  const env = makeEnv();
  assert.equal(await getPrivate(env, "does/not/exist.json"), null);
});

test("deletePrivate removes the object", async () => {
  const env = makeEnv();
  await putPrivate(env, "auth/user_1.json", { userId: "user_1" });
  await deletePrivate(env, "auth/user_1.json");
  assert.equal(await getPrivate(env, "auth/user_1.json"), null);
});

test("listPrivate filters by prefix (used sparingly, §26)", async () => {
  const env = makeEnv();
  await putPrivate(env, "jobs/cities/londrina.json", {});
  await putPrivate(env, "jobs/cities/curitiba.json", {});
  await putPrivate(env, "jobs/brokers/joao.json", {});

  const result = await listPrivate(env, "jobs/cities/");
  assert.equal(result.objects.length, 2);
});

test("throws a clear error when the IMOB_PRIVATE binding is missing", async () => {
  await assert.rejects(() => getPrivate({}, "x.json"), /IMOB_PRIVATE/);
});
