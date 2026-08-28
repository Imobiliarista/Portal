import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoute, buildListingEditUrl } from "../../../frontend/painel/router.js";

test("parseRoute recognizes the dashboard", () => {
  assert.deepEqual(parseRoute("/"), { name: "dashboard" });
  assert.deepEqual(parseRoute(""), { name: "dashboard" });
});

test("parseRoute recognizes perfil, exportação and imóveis", () => {
  assert.deepEqual(parseRoute("/perfil"), { name: "profile" });
  assert.deepEqual(parseRoute("/exportacao"), { name: "export" });
  assert.deepEqual(parseRoute("/imoveis"), { name: "listings" });
  assert.deepEqual(parseRoute("/imoveis/novo"), { name: "listing-new" });
  assert.deepEqual(parseRoute("/imoveis/abc123"), { name: "listing-edit", id: "abc123" });
});

test("parseRoute falls back to not-found for unknown paths", () => {
  assert.deepEqual(parseRoute("/nada"), { name: "not-found" });
});

// painel is a path under the apex domain now (frontend/dispatch.js), not a
// subdomain, so real URLs arrive here with a leading "/painel" segment —
// parseRoute("/painel/X") must resolve exactly like parseRoute("/X") did
// before the migration.
test("parseRoute strips a leading /painel prefix and matches the unprefixed route", () => {
  const cases = ["/", "/perfil", "/exportacao", "/imoveis", "/imoveis/novo", "/imoveis/abc123", "/nada"];
  for (const path of cases) {
    const prefixed = path === "/" ? "/painel" : `/painel${path}`;
    assert.deepEqual(parseRoute(prefixed), parseRoute(path), `expected parseRoute(${prefixed}) to match parseRoute(${path})`);
  }
});

test("parseRoute also strips a trailing-slash /painel/ prefix", () => {
  assert.deepEqual(parseRoute("/painel/imoveis"), { name: "listings" });
  assert.deepEqual(parseRoute("/painel/"), { name: "dashboard" });
});

test("buildListingEditUrl builds a /painel-prefixed URL", () => {
  assert.equal(buildListingEditUrl("abc123"), "/painel/imoveis/abc123");
});
