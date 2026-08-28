import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModule } from "../../frontend/dispatch.js";

const APEX = "imobiliarista.net";

test("imobiliarista.net/painel loads the painel module, not a city slug on the portal", () => {
  const result = resolveModule({ hostname: APEX, pathname: "/painel", search: "" });
  assert.equal(result.modulePath, "/painel/app.js");
  assert.equal(result.isPainelHost, true);
  assert.equal(result.isPortalHost, false);
  assert.equal(result.isMinisite, false);
});

test("imobiliarista.net/painel/imoveis also loads the painel module", () => {
  const result = resolveModule({ hostname: APEX, pathname: "/painel/imoveis", search: "" });
  assert.equal(result.modulePath, "/painel/app.js");
});

test("imobiliarista.net/admin loads the admin module, not a city slug on the portal", () => {
  const result = resolveModule({ hostname: APEX, pathname: "/admin", search: "" });
  assert.equal(result.modulePath, "/admin/app.js");
  assert.equal(result.isAdminHost, true);
  assert.equal(result.isPortalHost, false);
  assert.equal(result.isMinisite, false);
});

test("imobiliarista.net/admin/brokers also loads the admin module", () => {
  const result = resolveModule({ hostname: APEX, pathname: "/admin/brokers", search: "" });
  assert.equal(result.modulePath, "/admin/app.js");
});

test("a plain city path on the apex domain still loads the portal module", () => {
  const result = resolveModule({ hostname: APEX, pathname: "/londrina", search: "" });
  assert.equal(result.modulePath, "/portal/app.js");
  assert.equal(result.isPortalHost, true);
});

test("the apex root loads the portal module", () => {
  const result = resolveModule({ hostname: APEX, pathname: "/", search: "" });
  assert.equal(result.modulePath, "/portal/app.js");
});

test("a corretor slug subdomain loads the minisite module", () => {
  const result = resolveModule({ hostname: `joao.${APEX}`, pathname: "/", search: "" });
  assert.equal(result.modulePath, "/minisite/app.js");
  assert.equal(result.isMinisite, true);
});

// painel/admin dispatch by path is checked before isMinisite in the
// modulePath decision — isMinisite itself stays a pure hostname computation
// (a corretor subdomain is still a minisite host), but a /painel or /admin
// path on it still wins the module choice, matching the documented check
// order (that combination shouldn't occur in real navigation, but the
// priority is still the contract).
test("painel/admin path dispatch wins over isMinisite's hostname check", () => {
  const result = resolveModule({ hostname: `joao.${APEX}`, pathname: "/painel", search: "" });
  assert.equal(result.modulePath, "/painel/app.js");
  assert.equal(result.isPainelHost, true);
  assert.equal(result.isMinisite, true);
});

test("dados. and media. stay reserved and are never treated as a minisite slug", () => {
  for (const hostname of [`dados.${APEX}`, `media.${APEX}`]) {
    const result = resolveModule({ hostname, pathname: "/", search: "" });
    assert.equal(result.isMinisite, false, `expected ${hostname} not to be treated as a minisite`);
  }
});

test("legacy painel./admin. subdomains fall back to the portal, not a minisite slug lookup", () => {
  for (const hostname of [`painel.${APEX}`, `admin.${APEX}`]) {
    const result = resolveModule({ hostname, pathname: "/", search: "" });
    assert.equal(result.isMinisite, false, `expected ${hostname} not to be treated as a minisite`);
    assert.equal(result.modulePath, "/portal/app.js");
  }
});

test("?app= dev override still works on localhost", () => {
  assert.equal(resolveModule({ hostname: "localhost", pathname: "/", search: "?app=painel" }).modulePath, "/painel/app.js");
  assert.equal(resolveModule({ hostname: "localhost", pathname: "/", search: "?app=admin" }).modulePath, "/admin/app.js");
  assert.equal(resolveModule({ hostname: "127.0.0.1", pathname: "/", search: "?app=painel" }).modulePath, "/painel/app.js");
});

test("?app= dev override is ignored off localhost/127.0.0.1", () => {
  assert.equal(resolveModule({ hostname: APEX, pathname: "/", search: "?app=painel" }).modulePath, "/portal/app.js");
});
