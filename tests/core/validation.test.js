import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSlug,
  isEmail,
  isPrice,
  isLatitude,
  isLongitude,
  isUrl,
  isEnum,
  pickAllowed,
  validate,
  assertValid,
  ValidationError,
} from "../../core/validation.js";

test("isSlug accepts valid slugs and rejects invalid ones", () => {
  assert.equal(isSlug("apartamento-centro-123"), true);
  assert.equal(isSlug("Apartamento"), false);
  assert.equal(isSlug("ap to"), false);
  assert.equal(isSlug(""), false);
  assert.equal(isSlug("-lead"), false);
});

test("isEmail basic checks", () => {
  assert.equal(isEmail("joao@imobiliarista.net"), true);
  assert.equal(isEmail("invalido"), false);
});

test("isPrice rejects negative numbers", () => {
  assert.equal(isPrice(450000), true);
  assert.equal(isPrice(-1), false);
  assert.equal(isPrice("450000"), false);
});

test("isLatitude/isLongitude enforce ranges", () => {
  assert.equal(isLatitude(-23.5), true);
  assert.equal(isLatitude(91), false);
  assert.equal(isLongitude(-51.2), true);
  assert.equal(isLongitude(-181), false);
});

test("isUrl only allows http(s) by default", () => {
  assert.equal(isUrl("https://media.imobiliarista.net/x.webp"), true);
  assert.equal(isUrl("javascript:alert(1)"), false);
  assert.equal(isUrl("not a url"), false);
});

test("isEnum checks membership", () => {
  assert.equal(isEnum("venda", ["venda", "aluguel"]), true);
  assert.equal(isEnum("permuta", ["venda", "aluguel"]), false);
});

test("pickAllowed drops unlisted keys (never persists raw body, §78)", () => {
  const input = { title: "Apto", price: 100, isAdmin: true };
  const picked = pickAllowed(input, ["title", "price"]);
  assert.deepEqual(picked, { title: "Apto", price: 100 });
  assert.equal("isAdmin" in picked, false);
});

test("validate reports missing required fields and invalid values", () => {
  const result = validate(
    { price: -1 },
    { price: isPrice, title: isSlug },
    { required: ["title"] },
  );
  assert.equal(result.valid, false);
  const fields = result.errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ["price", "title"]);
});

test("assertValid throws ValidationError on invalid input", () => {
  assert.throws(
    () => assertValid({ price: -1 }, ["price"], { price: isPrice }, { required: ["price"] }),
    ValidationError,
  );
});

test("assertValid returns the picked object when valid", () => {
  const result = assertValid(
    { price: 100, extra: "drop me" },
    ["price"],
    { price: isPrice },
    { required: ["price"] },
  );
  assert.deepEqual(result, { price: 100 });
});
