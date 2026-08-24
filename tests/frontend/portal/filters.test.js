import { test } from "node:test";
import assert from "node:assert/strict";
import { filterCards, sortCards, shardsNeededForFilters } from "../../../frontend/portal/filters.js";

const CARDS = [
  { id: "1", purpose: "venda", type: "apartamento", district: "Centro", price: 300000, bedrooms: 2, bathrooms: 1, parkingSpaces: 1, area: 60, priority: 0, featured: false },
  { id: "2", purpose: "venda", type: "casa", district: "Centro", price: 800000, bedrooms: 4, bathrooms: 3, parkingSpaces: 2, area: 200, priority: 1, featured: true },
  { id: "3", purpose: "aluguel", type: "apartamento", district: "Gleba", price: 1500, bedrooms: 1, bathrooms: 1, parkingSpaces: 0, area: 35, priority: 0, featured: false },
];

test("filterCards with no filters returns everything", () => {
  assert.equal(filterCards(CARDS, {}).length, 3);
});

test("filterCards matches purpose/type/district case-insensitively (doc examples mix casing)", () => {
  const result = filterCards(CARDS, { purpose: "VENDA", district: "centro" });
  assert.deepEqual(result.map((c) => c.id), ["1", "2"]);
});

test("filterCards applies numeric range filters", () => {
  assert.deepEqual(filterCards(CARDS, { priceMin: 200000, priceMax: 500000 }).map((c) => c.id), ["1"]);
  assert.deepEqual(filterCards(CARDS, { bedroomsMin: 4 }).map((c) => c.id), ["2"]);
  assert.deepEqual(filterCards(CARDS, { areaMax: 50 }).map((c) => c.id), ["3"]);
});

test("filterCards combines multiple criteria (AND)", () => {
  const result = filterCards(CARDS, { purpose: "venda", bedroomsMin: 3 });
  assert.deepEqual(result.map((c) => c.id), ["2"]);
});

test("sortCards: price-asc / price-desc / area-asc / area-desc", () => {
  assert.deepEqual(sortCards(CARDS, "price-asc").map((c) => c.id), ["3", "1", "2"]);
  assert.deepEqual(sortCards(CARDS, "price-desc").map((c) => c.id), ["2", "1", "3"]);
  assert.deepEqual(sortCards(CARDS, "area-asc").map((c) => c.id), ["3", "1", "2"]);
});

test("sortCards: relevance favors priority then featured, defaults when sortBy is unknown", () => {
  assert.deepEqual(sortCards(CARDS, "relevance").map((c) => c.id), ["2", "1", "3"]);
  assert.deepEqual(sortCards(CARDS, "not-a-real-sort").map((c) => c.id), ["2", "1", "3"]);
});

test("sortCards does not mutate the input array", () => {
  const copy = [...CARDS];
  sortCards(CARDS, "price-asc");
  assert.deepEqual(CARDS, copy);
});

const INDEX_ENTRIES = [
  { id: "1", slug: "a", shard: 1, purpose: "venda", type: "apartamento", district: "centro", price: 300000 },
  { id: "2", slug: "b", shard: 1, purpose: "venda", type: "casa", district: "centro", price: 800000 },
  { id: "3", slug: "c", shard: 2, purpose: "aluguel", type: "apartamento", district: "gleba", price: 1500 },
];

test("shardsNeededForFilters returns only shards containing a match (§21-22)", () => {
  assert.deepEqual(shardsNeededForFilters(INDEX_ENTRIES, { purpose: "aluguel" }), [2]);
  assert.deepEqual(shardsNeededForFilters(INDEX_ENTRIES, {}), [1, 2]);
  assert.deepEqual(shardsNeededForFilters(INDEX_ENTRIES, { type: "sobrado" }), []);
});
