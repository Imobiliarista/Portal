import { test } from "node:test";
import assert from "node:assert/strict";
import { getDataBaseUrl, fetchJson, createDataClient } from "../../../frontend/portal/data.js";

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

test("getDataBaseUrl returns the production R2 DATA Custom Domain by default", async () => {
  await withGlobals({ window: {}, location: { hostname: "imobiliarista.net" } }, () => {
    assert.equal(getDataBaseUrl(), "https://dados.imobiliarista.net");
  });
});

test("getDataBaseUrl returns \"\" for local dev (fixtures served same-origin)", async () => {
  await withGlobals({ window: {}, location: { hostname: "localhost" } }, () => {
    assert.equal(getDataBaseUrl(), "");
  });
  await withGlobals({ window: {}, location: { hostname: "127.0.0.1" } }, () => {
    assert.equal(getDataBaseUrl(), "");
  });
});

test("getDataBaseUrl honors an empty-string override (same-origin, used by local dev)", async () => {
  await withGlobals(
    { window: { __IMOB_DATA_BASE_URL__: "" }, location: { hostname: "imobiliarista.net" } },
    () => {
      assert.equal(getDataBaseUrl(), "");
    },
  );
});

test("getDataBaseUrl honors the window.__IMOB_DATA_BASE_URL__ escape hatch", async () => {
  await withGlobals(
    { window: { __IMOB_DATA_BASE_URL__: "https://staging.example" }, location: { hostname: "imobiliarista.net" } },
    () => {
      assert.equal(getDataBaseUrl(), "https://staging.example");
    },
  );
});

test("fetchJson returns null on HTTP 404 (§75, §77 — not-found is data, not an error)", async () => {
  await withGlobals({ fetch: async () => new Response(null, { status: 404 }) }, async () => {
    assert.equal(await fetchJson("https://example/x.json"), null);
  });
});

test("fetchJson throws on other non-2xx statuses", async () => {
  await withGlobals({ fetch: async () => new Response(null, { status: 500 }) }, async () => {
    await assert.rejects(() => fetchJson("https://example/x.json"), /HTTP 500/);
  });
});

test("fetchJson parses the body on success", async () => {
  await withGlobals(
    { fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }) },
    async () => {
      assert.deepEqual(await fetchJson("https://example/x.json"), { ok: true });
    },
  );
});

test("createDataClient builds requests against storage/keys.js paths under the given base URL", async () => {
  const requestedUrls = [];
  await withGlobals(
    {
      fetch: async (url) => {
        requestedUrls.push(url);
        return new Response(JSON.stringify([]), { status: 200 });
      },
    },
    async () => {
      const client = createDataClient("https://dados.imobiliarista.net");
      await client.cityManifest("londrina");
      await client.cityShard("londrina", 2);
      await client.listing("apartamento-centro-123");
      await client.portalCities();
      await client.brokerProfile("joao");
    },
  );

  assert.deepEqual(requestedUrls, [
    "https://dados.imobiliarista.net/cities/londrina/manifest.json",
    "https://dados.imobiliarista.net/cities/londrina/002.json",
    "https://dados.imobiliarista.net/listings/apartamento-centro-123.json",
    "https://dados.imobiliarista.net/portal/cities.json",
    "https://dados.imobiliarista.net/brokers/joao/profile.json",
  ]);
});
