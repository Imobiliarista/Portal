import { test } from "node:test";
import assert from "node:assert/strict";
import { buildManifestObject, PWA_MANIFEST_CONFIG } from "../../../modules/pwa/manifest.js";

test("buildManifestObject returns the fields a Web App Manifest needs", () => {
  const manifest = buildManifestObject();
  assert.equal(manifest.name, "imobiliarista.net");
  assert.equal(manifest.short_name, "Imobiliarista");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
});

test("buildManifestObject's only input is the static config — output can't vary per corretor/imóvel (§48)", () => {
  assert.deepEqual(buildManifestObject({ ...PWA_MANIFEST_CONFIG }), buildManifestObject());
});

test("buildManifestObject is a fresh object each call, not a shared reference", () => {
  const a = buildManifestObject();
  const b = buildManifestObject();
  assert.notEqual(a, b);
  assert.notEqual(a.icons, b.icons);
  a.icons.push({ src: "/mutated.png" });
  assert.equal(b.icons.length, 1);
});

test("PWA_MANIFEST_CONFIG is frozen (accidental mutation would leak across builds)", () => {
  assert.equal(Object.isFrozen(PWA_MANIFEST_CONFIG), true);
  assert.equal(Object.isFrozen(PWA_MANIFEST_CONFIG.icons), true);
});

test("buildManifestObject is valid JSON round-trip", () => {
  const manifest = buildManifestObject();
  const roundTripped = JSON.parse(JSON.stringify(manifest));
  assert.deepEqual(roundTripped, manifest);
});
