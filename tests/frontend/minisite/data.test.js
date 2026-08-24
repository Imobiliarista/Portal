import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBrokerSlug, getDataBaseUrl, createDataClient } from "../../../frontend/minisite/data.js";

async function withGlobals(globalsToSet, fn) {
  const previous = {};
  for (const key of Object.keys(globalsToSet)) previous[key] = globalThis[key];
  Object.assign(globalThis, globalsToSet);
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(globalsToSet)) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  }
}

test("resolveBrokerSlug reads the first label of the hostname (§74)", async () => {
  await withGlobals({ window: {}, location: { hostname: "joao.imobiliarista.net" } }, () => {
    assert.equal(resolveBrokerSlug(), "joao");
  });
});

test("resolveBrokerSlug returns null for reserved/apex hosts (§75 — not a minisite)", async () => {
  for (const hostname of ["imobiliarista.net", "www.imobiliarista.net", "painel.imobiliarista.net", "admin.imobiliarista.net", "localhost"]) {
    await withGlobals({ window: {}, location: { hostname } }, () => {
      assert.equal(resolveBrokerSlug(), null, `expected null for ${hostname}`);
    });
  }
});

test("resolveBrokerSlug honors the window.__IMOB_MINISITE_SLUG__ escape hatch (dev on localhost)", async () => {
  await withGlobals({ window: { __IMOB_MINISITE_SLUG__: "joao" }, location: { hostname: "localhost" } }, () => {
    assert.equal(resolveBrokerSlug(), "joao");
  });
});

test("getDataBaseUrl mirrors the portal's local/production split", async () => {
  await withGlobals({ window: {}, location: { hostname: "localhost" } }, () => {
    assert.equal(getDataBaseUrl(), "");
  });
  await withGlobals({ window: {}, location: { hostname: "joao.imobiliarista.net" } }, () => {
    assert.equal(getDataBaseUrl(), "https://dados.imobiliarista.net");
  });
});

test("createDataClient builds requests against storage/keys.js broker paths", async () => {
  const requestedUrls = [];
  await withGlobals(
    {
      fetch: async (url) => {
        requestedUrls.push(url);
        return new Response(JSON.stringify(null), { status: 404 });
      },
    },
    async () => {
      const client = createDataClient("https://dados.imobiliarista.net");
      await client.profile("joao");
      await client.listingsFlat("joao");
      await client.listingsManifest("joao");
      await client.listingsShard("joao", 1);
    },
  );

  assert.deepEqual(requestedUrls, [
    "https://dados.imobiliarista.net/brokers/joao/profile.json",
    "https://dados.imobiliarista.net/brokers/joao/listings.json",
    "https://dados.imobiliarista.net/brokers/joao/listings/manifest.json",
    "https://dados.imobiliarista.net/brokers/joao/listings/001.json",
  ]);
});
