// business/catalogs.js — portal/cities.json + portal/modules.json builders
// (§66, Etapa 3).

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPortalCitiesCatalog, buildPortalModulesCatalog } from "../../business/catalogs.js";

test("buildPortalCitiesCatalog with zero cities produces a valid empty catalog, not an error (Etapa 3 estado vazio)", () => {
  const catalog = buildPortalCitiesCatalog([]);
  assert.deepEqual(catalog, { schemaVersion: 1, cities: [] });
});

test("buildPortalCitiesCatalog sorts deterministically by slug", () => {
  const catalog = buildPortalCitiesCatalog([
    { slug: "sao-paulo", name: "São Paulo", uf: "SP", totalListings: 10 },
    { slug: "londrina", name: "Londrina", uf: "PR", totalListings: 3 },
    { slug: "curitiba", name: "Curitiba", uf: "PR", totalListings: 0 },
  ]);
  assert.deepEqual(
    catalog.cities.map((c) => c.slug),
    ["curitiba", "londrina", "sao-paulo"],
  );
});

test("a city with zero listings is included with totalListings: 0, never omitted (§77 philosophy)", () => {
  const catalog = buildPortalCitiesCatalog([{ slug: "londrina", name: "Londrina", uf: "PR", totalListings: 0 }]);
  assert.equal(catalog.cities.length, 1);
  assert.equal(catalog.cities[0].totalListings, 0);
});

test("buildPortalCitiesCatalog only exposes slug/name/uf/totalListings — no private field leaks", () => {
  const catalog = buildPortalCitiesCatalog([
    { slug: "londrina", name: "Londrina", uf: "PR", totalListings: 3, secretInternalField: "leak" },
  ]);
  assert.deepEqual(Object.keys(catalog.cities[0]).sort(), ["name", "slug", "totalListings", "uf"]);
});

test("two calls with the same input produce byte-identical output (idempotent, no unstable timestamp)", () => {
  const cities = [{ slug: "londrina", name: "Londrina", uf: "PR", totalListings: 3 }];
  assert.deepEqual(buildPortalCitiesCatalog(cities), buildPortalCitiesCatalog(cities));
});

test("buildPortalModulesCatalog never exposes financial/plans/pwa (private or non-product modules)", () => {
  const catalog = buildPortalModulesCatalog();
  const ids = catalog.modules.map((m) => m.id);
  assert.ok(!ids.includes("financial"));
  assert.ok(!ids.includes("plans"));
  assert.ok(!ids.includes("pwa"));
});

test("buildPortalModulesCatalog entries are only { id, enabled } — no config/secret leaks", () => {
  const catalog = buildPortalModulesCatalog();
  for (const module of catalog.modules) {
    assert.deepEqual(Object.keys(module).sort(), ["enabled", "id"]);
    assert.equal(typeof module.enabled, "boolean");
  }
});

test("buildPortalModulesCatalog is pure and deterministic", () => {
  assert.deepEqual(buildPortalModulesCatalog(), buildPortalModulesCatalog());
});
