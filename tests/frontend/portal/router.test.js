import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoute, parseCityQuery, buildCityUrl, buildListingUrl, buildComparisonUrl } from "../../../frontend/portal/router.js";

test("parseRoute recognizes home", () => {
  assert.deepEqual(parseRoute("/"), { name: "home" });
  assert.deepEqual(parseRoute(""), { name: "home" });
});

test("parseRoute recognizes imóvel completo (§15)", () => {
  assert.deepEqual(parseRoute("/imovel/apartamento-centro-123"), {
    name: "listing",
    slug: "apartamento-centro-123",
  });
});

test("parseRoute recognizes a city with no query (§18)", () => {
  const route = parseRoute("/londrina");
  assert.equal(route.name, "city");
  assert.equal(route.citySlug, "londrina");
  assert.deepEqual(route.filters, {});
});

test("parseRoute parses city filters from the querystring (§20)", () => {
  const route = parseRoute("/londrina", "?purpose=venda&type=apartamento&priceMin=200000&bedroomsMin=2&sort=price-asc");
  assert.equal(route.name, "city");
  assert.deepEqual(route.filters, { purpose: "venda", type: "apartamento", priceMin: 200000, bedroomsMin: 2 });
  assert.equal(route.sortBy, "price-asc");
});

test("parseRoute falls back to not-found for unknown multi-segment paths", () => {
  assert.deepEqual(parseRoute("/a/b/c"), { name: "not-found" });
});

test("parseRoute recognizes comparação (§45)", () => {
  assert.deepEqual(parseRoute("/comparar"), { name: "comparison" });
  assert.equal(buildComparisonUrl(), "/comparar");
});

// painel/admin are dispatched to their own SPA modules by
// frontend/dispatch.js before this router ever runs — reserved here too,
// defensively, so a future dispatch bug can never fall through to the
// portal treating "painel"/"admin" as a city slug.
test("parseRoute reserves painel/admin as not-found instead of a city slug", () => {
  assert.deepEqual(parseRoute("/painel"), { name: "not-found" });
  assert.deepEqual(parseRoute("/admin"), { name: "not-found" });
});

test("parseCityQuery ignores blank/invalid numeric values", () => {
  const { filters } = parseCityQuery("?priceMin=&bedroomsMin=abc&district=Centro");
  assert.deepEqual(filters, { district: "Centro" });
});

test("buildCityUrl + buildListingUrl round-trip through parseRoute", () => {
  const filters = { purpose: "aluguel", priceMax: 3000 };
  const url = buildCityUrl("curitiba", { filters, sortBy: "area-desc" });
  const [pathname, search] = url.split("?");
  const route = parseRoute(pathname, `?${search}`);
  assert.equal(route.citySlug, "curitiba");
  assert.deepEqual(route.filters, filters);
  assert.equal(route.sortBy, "area-desc");

  assert.equal(buildListingUrl("apartamento-1"), "/imovel/apartamento-1");
});

test("buildCityUrl omits the querystring when there are no filters/sort", () => {
  assert.equal(buildCityUrl("londrina"), "/londrina");
});
