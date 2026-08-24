import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTour360LinkProps,
  renderFrontendModuleSource,
} from "../../../modules/tour-360/index.js";

test("buildTour360LinkProps returns null when tour360 is absent (§49: componente não renderiza)", () => {
  assert.equal(buildTour360LinkProps(null), null);
  assert.equal(buildTour360LinkProps(undefined), null);
});

test("buildTour360LinkProps returns null when url is missing/empty/not a string", () => {
  assert.equal(buildTour360LinkProps({}), null);
  assert.equal(buildTour360LinkProps({ url: "" }), null);
  assert.equal(buildTour360LinkProps({ url: null }), null);
  assert.equal(buildTour360LinkProps({ url: 123 }), null);
});

test("buildTour360LinkProps returns the link props for a valid tour360", () => {
  assert.deepEqual(buildTour360LinkProps({ url: "https://kuula.co/share/abc" }), {
    href: "https://kuula.co/share/abc",
    text: "Ver tour 360°",
    target: "_blank",
    rel: "noreferrer",
  });
});

test("buildTour360LinkProps opens the external provider in a new tab without leaking referrer", () => {
  const props = buildTour360LinkProps({ url: "https://my.matterport.com/show/?m=abc" });
  assert.equal(props.target, "_blank");
  assert.equal(props.rel, "noreferrer");
});

test("renderFrontendModuleSource embeds the function as a standalone ESM module", () => {
  const source = renderFrontendModuleSource();
  assert.match(source, /export function buildTour360LinkProps/);
  assert.doesNotMatch(source, /^import /m);
});

test("renderFrontendModuleSource output is loadable and behaves identically to the source function", async () => {
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = mkdtempSync(join(tmpdir(), "tour-360-generated-"));
  const path = join(dir, "tour-360.generated.js");
  writeFileSync(path, renderFrontendModuleSource());

  const generated = await import(`file://${path}`);
  assert.deepEqual(generated.buildTour360LinkProps({ url: "https://example.com/t" }), {
    href: "https://example.com/t",
    text: "Ver tour 360°",
    target: "_blank",
    rel: "noreferrer",
  });
  assert.equal(generated.buildTour360LinkProps(null), null);
});
