import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAppointmentInput } from "../../../modules/appointments/validation.js";

const VALID_INPUT = {
  listingSlug: "apartamento-centro-123",
  visitorName: "Maria Souza",
  visitorPhone: "(43) 99999-9999",
  message: "Tenho interesse em Apartamento no Centro",
};

test("validateAppointmentInput accepts a well-formed input", () => {
  const result = validateAppointmentInput(VALID_INPUT);
  assert.deepEqual(result, { valid: true, errors: {} });
});

test("validateAppointmentInput requires listingSlug and rejects a non-slug value", () => {
  assert.equal(validateAppointmentInput({ ...VALID_INPUT, listingSlug: undefined }).valid, false);
  const result = validateAppointmentInput({ ...VALID_INPUT, listingSlug: "Não é um slug!" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.listingSlug);
});

test("validateAppointmentInput requires visitorName", () => {
  const result = validateAppointmentInput({ ...VALID_INPUT, visitorName: "" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.visitorName);
});

test("validateAppointmentInput requires visitorPhone", () => {
  const result = validateAppointmentInput({ ...VALID_INPUT, visitorPhone: undefined });
  assert.equal(result.valid, false);
  assert.ok(result.errors.visitorPhone);
});

test("validateAppointmentInput treats visitorEmail as optional but validates it when present", () => {
  assert.equal(validateAppointmentInput({ ...VALID_INPUT, visitorEmail: undefined }).valid, true);
  assert.equal(validateAppointmentInput({ ...VALID_INPUT, visitorEmail: "" }).valid, true);
  const invalid = validateAppointmentInput({ ...VALID_INPUT, visitorEmail: "não é email" });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.visitorEmail);
  assert.equal(validateAppointmentInput({ ...VALID_INPUT, visitorEmail: "maria@example.com" }).valid, true);
});

test("validateAppointmentInput requires a non-empty message (pre-filled by the UI, but still required)", () => {
  assert.equal(validateAppointmentInput({ ...VALID_INPUT, message: "" }).valid, false);
  assert.equal(validateAppointmentInput({ ...VALID_INPUT, message: undefined }).valid, false);
  const result = validateAppointmentInput({ ...VALID_INPUT, message: "" });
  assert.match(result.errors.message, /Escreva uma mensagem/);
});

test("validateAppointmentInput bounds the message length", () => {
  const tooLong = validateAppointmentInput({ ...VALID_INPUT, message: "x".repeat(501) });
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.errors.message, /muito longa/);
});

test("validateAppointmentInput never throws on garbage input", () => {
  assert.doesNotThrow(() => validateAppointmentInput({}));
  assert.doesNotThrow(() => validateAppointmentInput(null));
  assert.doesNotThrow(() => validateAppointmentInput(undefined));
});
