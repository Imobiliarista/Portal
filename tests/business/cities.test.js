import { test } from "node:test";
import assert from "node:assert/strict";
import { getCityBySlug, requireCityBySlug, UnknownCityError } from "../../business/cities.js";

test("getCityBySlug resolves a known slug to { name, uf, ibgeCode }", () => {
  const city = getCityBySlug("londrina");
  assert.deepEqual(city, { name: "Londrina", uf: "PR", ibgeCode: 4113700 });
});

test("getCityBySlug returns null for an unknown slug", () => {
  assert.equal(getCityBySlug("cidade-que-nao-existe"), null);
});

test("requireCityBySlug returns the same shape as getCityBySlug for a known slug", () => {
  assert.deepEqual(requireCityBySlug("sao-paulo"), getCityBySlug("sao-paulo"));
});

test("requireCityBySlug throws UnknownCityError for an unknown slug", () => {
  assert.throws(() => requireCityBySlug("cidade-que-nao-existe"), UnknownCityError);
});

test("the placeholder sample catalog disambiguates same-name municípios in different UFs (§ generate-cities-catalog.js)", () => {
  const pi = getCityBySlug("bom-jesus-pi");
  const rs = getCityBySlug("bom-jesus-rs");
  assert.equal(pi.name, "Bom Jesus");
  assert.equal(rs.name, "Bom Jesus");
  assert.notEqual(pi.uf, rs.uf);
});
