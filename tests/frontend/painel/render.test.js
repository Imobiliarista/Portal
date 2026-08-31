// tests/frontend/painel/render.test.js
//
// renderListingForm (§54/frontend/painel/render.js) is otherwise "verified
// visually" per this file's own header comment, but the new
// livingArea/lotArea/.../amenities fields (PR #43's model change, painel
// left out of that PR's scope) are worth a smoke test: renderListingForm
// must not throw for a listing that has none of the new fields (legacy
// data) nor for one that has all of them, and the amenities checkboxes it
// renders must reflect which ones are already selected. Runs against
// tests/support/fake-dom.js, same convention as
// tests/frontend/portal/app.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeElement, createFakeDocument } from "../../support/fake-dom.js";
import { renderListingForm } from "../../../frontend/painel/render.js";

function withFakeDocument(fn) {
  const previousDocument = globalThis.document;
  globalThis.document = createFakeDocument();
  try {
    return fn();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

function findAll(node, predicate, out = []) {
  for (const child of node.children ?? []) {
    if (predicate(child)) out.push(child);
    findAll(child, predicate, out);
  }
  return out;
}

function findInputsNamed(container, name) {
  return findAll(container, (n) => n.tagName === "INPUT" && n.attributes.name === name);
}

test("renderListingForm renders a listing with none of the new fields set (legacy data) without throwing", () => {
  withFakeDocument(() => {
    const container = new FakeElement("div");
    assert.doesNotThrow(() => {
      renderListingForm(container, { listing: { title: "Casa", features: { bedrooms: 2 } }, mode: "edit" });
    });
    const livingAreaInputs = findInputsNamed(container, "livingArea");
    assert.equal(livingAreaInputs.length, 1);
    assert.equal(livingAreaInputs[0].value, "");
    // nenhuma comodidade marcada
    const checked = findAll(container, (n) => n.tagName === "INPUT" && n.attributes.name === "amenities" && n.attributes.checked);
    assert.equal(checked.length, 0);
  });
});

test("renderListingForm renders a listing with all of the new fields set", () => {
  withFakeDocument(() => {
    const container = new FakeElement("div");
    const listing = {
      title: "Casa",
      city: "São Paulo",
      street: "Rua das Flores",
      streetNumber: "123",
      zone: "central",
      municipalZoning: "ZR3",
      yearBuilt: 1998,
      municipalRegistrationCode: "12345-6",
      amenities: ["Pool", "Gym"],
      features: {
        bedrooms: 3,
        bathrooms: 2,
        parkingSpaces: 1,
        livingArea: 120,
        lotArea: 300,
        livingRooms: 2,
        kitchens: 1,
        suites: 1,
        unitFloor: 5,
      },
    };
    assert.doesNotThrow(() => {
      renderListingForm(container, { listing, mode: "edit" });
    });

    // FakeElement#value is a plain property (no real-DOM string coercion),
    // so compare via String() — el() itself passes the raw number/string
    // through untouched either way.
    assert.equal(String(findInputsNamed(container, "livingArea")[0].value), "120");
    assert.equal(String(findInputsNamed(container, "lotArea")[0].value), "300");
    assert.equal(String(findInputsNamed(container, "street")[0].value), "Rua das Flores");
    assert.equal(String(findInputsNamed(container, "streetNumber")[0].value), "123");
    assert.equal(String(findInputsNamed(container, "yearBuilt")[0].value), "1998");
    assert.equal(String(findInputsNamed(container, "municipalRegistrationCode")[0].value), "12345-6");

    const zoneSelect = findAll(container, (n) => n.tagName === "SELECT" && n.attributes.name === "zone")[0];
    assert.ok(zoneSelect);
    const selectedOption = findAll(zoneSelect, (n) => n.tagName === "OPTION" && n.attributes.selected)[0];
    assert.equal(selectedOption.attributes.value, "central");
    assert.equal(selectedOption.textContent, "Central"); // ZONE_LABELS, não o id cru

    const amenityInputs = findInputsNamed(container, "amenities");
    assert.ok(amenityInputs.length > 2); // as 39 comodidades definidas em business/amenities.js
    const checkedAmenities = amenityInputs.filter((n) => n.attributes.checked).map((n) => n.attributes.value);
    assert.deepEqual(checkedAmenities.sort(), ["Gym", "Pool"]);
  });
});
