// tests/frontend/painel/forms.test.js
//
// buildListingPayload (§54/frontend/painel/forms.js) maps a listing form's
// FormData onto business/listings.js's create/update payload shape — this
// is the exact mapping that used to send the old "area" feature key
// (rejected by the Worker after PR #43 switched to livingArea/lotArea/
// livingRooms/kitchens/suites/unitFloor + the new root-level address/
// amenities fields). Uses the real global FormData (Node has one), not a
// DOM shim — buildListingPayload only ever reads from it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildListingPayload } from "../../../frontend/painel/forms.js";

function formDataFrom(entries) {
  const fd = new FormData();
  for (const [key, value] of entries) fd.append(key, value);
  return fd;
}

test("buildListingPayload sends livingArea (not the old area field) in features", () => {
  const fd = formDataFrom([
    ["bedrooms", "3"],
    ["bathrooms", "2"],
    ["parkingSpaces", "1"],
    ["livingArea", "120"],
  ]);
  const payload = buildListingPayload(fd);
  assert.deepEqual(payload.features, { bedrooms: 3, bathrooms: 2, parkingSpaces: 1, livingArea: 120 });
  assert.equal(payload.features.area, undefined);
});

test("buildListingPayload omits features entirely when a required feature (livingArea included) is missing", () => {
  const fd = formDataFrom([
    ["bedrooms", "3"],
    ["bathrooms", "2"],
    ["parkingSpaces", "1"],
  ]);
  const payload = buildListingPayload(fd);
  assert.equal(payload.features, undefined);
});

test("buildListingPayload includes the new optional feature fields when present", () => {
  const fd = formDataFrom([
    ["bedrooms", "3"],
    ["bathrooms", "2"],
    ["parkingSpaces", "1"],
    ["livingArea", "120"],
    ["lotArea", "300"],
    ["livingRooms", "2"],
    ["kitchens", "1"],
    ["suites", "1"],
    ["unitFloor", "5"],
  ]);
  const payload = buildListingPayload(fd);
  assert.deepEqual(payload.features, {
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 1,
    livingArea: 120,
    lotArea: 300,
    livingRooms: 2,
    kitchens: 1,
    suites: 1,
    unitFloor: 5,
  });
});

test("buildListingPayload keeps working with none of the new optional feature fields set", () => {
  const fd = formDataFrom([
    ["bedrooms", "3"],
    ["bathrooms", "2"],
    ["parkingSpaces", "1"],
    ["livingArea", "120"],
  ]);
  const payload = buildListingPayload(fd);
  assert.deepEqual(payload.features, { bedrooms: 3, bathrooms: 2, parkingSpaces: 1, livingArea: 120 });
});

test("buildListingPayload reads the new root-level address/zoning fields", () => {
  const fd = formDataFrom([
    ["street", "Rua das Flores"],
    ["streetNumber", "123"],
    ["zone", "central"],
    ["municipalZoning", "ZR3"],
    ["yearBuilt", "1998"],
    ["municipalRegistrationCode", "12345-6"],
  ]);
  const payload = buildListingPayload(fd);
  assert.equal(payload.street, "Rua das Flores");
  assert.equal(payload.streetNumber, "123");
  assert.equal(payload.zone, "central");
  assert.equal(payload.municipalZoning, "ZR3");
  assert.equal(payload.yearBuilt, 1998);
  assert.equal(payload.municipalRegistrationCode, "12345-6");
});

test("buildListingPayload omits the new root-level fields entirely when absent", () => {
  const payload = buildListingPayload(formDataFrom([]));
  for (const key of ["street", "streetNumber", "zone", "municipalZoning", "yearBuilt", "municipalRegistrationCode"]) {
    assert.equal(key in payload, false, `expected payload.${key} to be absent`);
  }
});

test("buildListingPayload turns multiple checked amenities into an array", () => {
  const fd = formDataFrom([
    ["amenities", "Pool"],
    ["amenities", "Gym"],
    ["amenities", "Elevator"],
  ]);
  const payload = buildListingPayload(fd);
  assert.deepEqual(payload.amenities, ["Pool", "Gym", "Elevator"]);
});

test("buildListingPayload omits amenities when none are checked", () => {
  const payload = buildListingPayload(formDataFrom([]));
  assert.equal("amenities" in payload, false);
});
