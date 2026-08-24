import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPARISON_STORAGE_KEY,
  MAX_COMPARISON_ITEMS,
  readComparisonSlugs,
  writeComparisonSlugs,
  clearComparisonSlugs,
  isInComparison,
  toggleComparisonSlug,
  buildComparisonRows,
  renderFrontendModuleSource,
} from "../../../modules/comparison/index.js";

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test("readComparisonSlugs returns [] with no storage and with an empty/missing key", () => {
  assert.deepEqual(readComparisonSlugs(null), []);
  assert.deepEqual(readComparisonSlugs(createMemoryStorage()), []);
});

test("readComparisonSlugs tolerates corrupted/adulterated content — never throws", () => {
  assert.deepEqual(readComparisonSlugs(createMemoryStorage({ [COMPARISON_STORAGE_KEY]: "not json" })), []);
  assert.deepEqual(readComparisonSlugs(createMemoryStorage({ [COMPARISON_STORAGE_KEY]: '{"not":"an array"}' })), []);
  assert.deepEqual(
    readComparisonSlugs(createMemoryStorage({ [COMPARISON_STORAGE_KEY]: JSON.stringify(["a", 1, null, "", "b"]) })),
    ["a", "b"],
  );
});

test("writeComparisonSlugs round-trips through readComparisonSlugs and filters invalid entries", () => {
  const storage = createMemoryStorage();
  writeComparisonSlugs(["casa-1", 42, "", "casa-2"], storage);
  assert.deepEqual(readComparisonSlugs(storage), ["casa-1", "casa-2"]);
});

test("writeComparisonSlugs with no storage is a silent no-op", () => {
  assert.doesNotThrow(() => writeComparisonSlugs(["casa-1"], null));
});

test("clearComparisonSlugs empties the selection", () => {
  const storage = createMemoryStorage();
  writeComparisonSlugs(["casa-1", "casa-2"], storage);
  clearComparisonSlugs(storage);
  assert.deepEqual(readComparisonSlugs(storage), []);
});

test("isInComparison", () => {
  assert.equal(isInComparison(["a", "b"], "a"), true);
  assert.equal(isInComparison(["a", "b"], "c"), false);
  assert.equal(isInComparison(null, "a"), false);
});

test("toggleComparisonSlug adds a new slug", () => {
  const storage = createMemoryStorage();
  const result = toggleComparisonSlug("casa-1", storage);
  assert.deepEqual(result, { slugs: ["casa-1"], added: true });
  assert.deepEqual(readComparisonSlugs(storage), ["casa-1"]);
});

test("toggleComparisonSlug removes an already-selected slug", () => {
  const storage = createMemoryStorage();
  writeComparisonSlugs(["casa-1", "casa-2"], storage);
  const result = toggleComparisonSlug("casa-1", storage);
  assert.deepEqual(result, { slugs: ["casa-2"], added: false });
  assert.deepEqual(readComparisonSlugs(storage), ["casa-2"]);
});

test("toggleComparisonSlug refuses to add past MAX_COMPARISON_ITEMS, leaving the selection untouched", () => {
  const storage = createMemoryStorage();
  const full = Array.from({ length: MAX_COMPARISON_ITEMS }, (_, i) => `casa-${i}`);
  writeComparisonSlugs(full, storage);
  const result = toggleComparisonSlug("casa-extra", storage);
  assert.deepEqual(result, { slugs: full, added: false, atLimit: true });
  assert.deepEqual(readComparisonSlugs(storage), full);
});

test("toggleComparisonSlug with an invalid slug is a no-op", () => {
  const storage = createMemoryStorage();
  assert.deepEqual(toggleComparisonSlug("", storage), { slugs: [], added: false });
  assert.deepEqual(toggleComparisonSlug(null, storage), { slugs: [], added: false });
});

test("buildComparisonRows returns [] with no listings, one row per compared field", () => {
  const rows = buildComparisonRows([]);
  assert.deepEqual(
    rows.map((r) => r.key),
    ["purpose", "type", "price", "condominium", "iptu", "city", "district", "bedrooms", "bathrooms", "parkingSpaces", "area"],
  );
  for (const row of rows) assert.deepEqual(row.values, []);
});

test("buildComparisonRows extracts raw field values from listing-public.schema.json shapes (§15)", () => {
  const listingA = {
    purpose: "venda",
    type: "apartamento",
    price: 450000,
    condominium: 600,
    iptu: 120,
    location: { city: "Londrina", district: "Centro" },
    features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, area: 95 },
  };
  const listingB = {
    purpose: "aluguel",
    type: "casa",
    price: 2500,
    condominium: null,
    iptu: null,
    location: { city: "Londrina", district: "Gleba Palhano" },
    features: { bedrooms: 4, bathrooms: 3, parkingSpaces: 3, area: 180 },
  };

  const rows = buildComparisonRows([listingA, listingB]);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.values]));

  assert.deepEqual(byKey.purpose, ["venda", "aluguel"]);
  assert.deepEqual(byKey.price, [450000, 2500]);
  assert.deepEqual(byKey.condominium, [600, null]);
  assert.deepEqual(byKey.iptu, [120, null]);
  assert.deepEqual(byKey.city, ["Londrina", "Londrina"]);
  assert.deepEqual(byKey.district, ["Centro", "Gleba Palhano"]);
  assert.deepEqual(byKey.bedrooms, [3, 4]);
  assert.deepEqual(byKey.bathrooms, [2, 3]);
  assert.deepEqual(byKey.parkingSpaces, [2, 3]);
  assert.deepEqual(byKey.area, [95, 180]);

  const purposeRow = rows.find((r) => r.key === "purpose");
  assert.equal(purposeRow.label, "Finalidade");
});

test("buildComparisonRows never throws on a missing/malformed listing — the column comes back all null", () => {
  const rows = buildComparisonRows([null, {}, undefined]);
  for (const row of rows) assert.deepEqual(row.values, [null, null, null]);
});

test("renderFrontendModuleSource embeds the functions as a standalone ESM module", () => {
  const source = renderFrontendModuleSource();
  assert.match(source, /export function readComparisonSlugs/);
  assert.match(source, /export function toggleComparisonSlug/);
  assert.match(source, /export function buildComparisonRows/);
  assert.doesNotMatch(source, /^import /m);
});

test("renderFrontendModuleSource output is loadable and behaves identically to the source functions", async () => {
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = mkdtempSync(join(tmpdir(), "comparison-generated-"));
  const path = join(dir, "comparison.generated.js");
  writeFileSync(path, renderFrontendModuleSource());

  const generated = await import(`file://${path}`);
  const storage = createMemoryStorage();

  assert.deepEqual(generated.toggleComparisonSlug("casa-1", storage), { slugs: ["casa-1"], added: true });
  assert.deepEqual(generated.readComparisonSlugs(storage), ["casa-1"]);
  assert.equal(generated.isInComparison(["casa-1"], "casa-1"), true);

  const rows = generated.buildComparisonRows([{ price: 100, location: {}, features: {} }]);
  assert.equal(rows.find((r) => r.key === "price").values[0], 100);
});
