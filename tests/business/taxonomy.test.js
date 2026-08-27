// business/taxonomy.js — portal/taxonomy.json builder (§65, Etapa 3).

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPortalTaxonomy } from "../../business/taxonomy.js";
import { PURPOSES } from "../../business/listings.js";

test("buildPortalTaxonomy returns the 4 required sections (§65)", () => {
  const taxonomy = buildPortalTaxonomy();
  assert.equal(taxonomy.schemaVersion, 1);
  assert.ok(Array.isArray(taxonomy.types));
  assert.ok(Array.isArray(taxonomy.purposes));
  assert.ok(Array.isArray(taxonomy.features));
  assert.ok(Array.isArray(taxonomy.priceRanges));
});

test("purposes mirror business/listings.js#PURPOSES exactly — never a hand-copied duplicate", () => {
  const taxonomy = buildPortalTaxonomy();
  assert.deepEqual(
    taxonomy.purposes.map((p) => p.id),
    PURPOSES,
  );
  for (const purpose of taxonomy.purposes) {
    assert.equal(typeof purpose.label, "string");
    assert.ok(purpose.label.length > 0);
  }
});

test("every type/feature option has a non-empty id and label", () => {
  const taxonomy = buildPortalTaxonomy();
  for (const list of [taxonomy.types, taxonomy.features]) {
    for (const option of list) {
      assert.equal(typeof option.id, "string");
      assert.ok(option.id.length > 0);
      assert.equal(typeof option.label, "string");
      assert.ok(option.label.length > 0);
    }
  }
});

test("types/features are sorted deterministically by id", () => {
  const taxonomy = buildPortalTaxonomy();
  const typeIds = taxonomy.types.map((t) => t.id);
  assert.deepEqual(typeIds, [...typeIds].sort());
  const featureIds = taxonomy.features.map((f) => f.id);
  assert.deepEqual(featureIds, [...featureIds].sort());
});

test("priceRanges satisfy schemas/taxonomy.schema.json's required shape", () => {
  const taxonomy = buildPortalTaxonomy();
  assert.ok(taxonomy.priceRanges.length > 0);
  for (const range of taxonomy.priceRanges) {
    assert.equal(typeof range.id, "string");
    assert.equal(typeof range.label, "string");
    assert.equal(typeof range.min, "number");
    assert.ok(range.max === null || typeof range.max === "number");
  }
  // the last band is open-ended (no ceiling) — must be representable as `null`.
  assert.equal(taxonomy.priceRanges.at(-1).max, null);
});

test("two calls produce byte-identical output (pure, no timestamps, idempotent)", () => {
  assert.deepEqual(buildPortalTaxonomy(), buildPortalTaxonomy());
});
