import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAppointmentInput } from "../../../modules/appointments/validation.js";

const NOW = new Date("2026-08-25T12:00:00Z");

const VALID_INPUT = {
  listingSlug: "apartamento-centro-123",
  visitorName: "Maria Souza",
  visitorPhone: "(43) 99999-9999",
  preferredDate: "2026-08-26",
  preferredTime: "14:30",
};

test("validateAppointmentInput accepts a well-formed input", () => {
  const result = validateAppointmentInput(VALID_INPUT, { now: NOW });
  assert.deepEqual(result, { valid: true, errors: {} });
});

test("validateAppointmentInput accepts today as preferredDate", () => {
  const result = validateAppointmentInput({ ...VALID_INPUT, preferredDate: "2026-08-25" }, { now: NOW });
  assert.equal(result.valid, true);
});

test("validateAppointmentInput requires listingSlug and rejects a non-slug value", () => {
  assert.equal(validateAppointmentInput({ ...VALID_INPUT, listingSlug: undefined }, { now: NOW }).valid, false);
  const result = validateAppointmentInput({ ...VALID_INPUT, listingSlug: "Não é um slug!" }, { now: NOW });
  assert.equal(result.valid, false);
  assert.ok(result.errors.listingSlug);
});

test("validateAppointmentInput requires visitorName", () => {
  const result = validateAppointmentInput({ ...VALID_INPUT, visitorName: "" }, { now: NOW });
  assert.equal(result.valid, false);
  assert.ok(result.errors.visitorName);
});

test("validateAppointmentInput requires visitorPhone", () => {
  const result = validateAppointmentInput({ ...VALID_INPUT, visitorPhone: undefined }, { now: NOW });
  assert.equal(result.valid, false);
  assert.ok(result.errors.visitorPhone);
});

test("validateAppointmentInput treats visitorEmail as optional but validates it when present", () => {
  assert.equal(validateAppointmentInput({ ...VALID_INPUT, visitorEmail: undefined }, { now: NOW }).valid, true);
  assert.equal(validateAppointmentInput({ ...VALID_INPUT, visitorEmail: "" }, { now: NOW }).valid, true);
  const invalid = validateAppointmentInput({ ...VALID_INPUT, visitorEmail: "não é email" }, { now: NOW });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.visitorEmail);
  assert.equal(validateAppointmentInput({ ...VALID_INPUT, visitorEmail: "maria@example.com" }, { now: NOW }).valid, true);
});

test("validateAppointmentInput rejects a malformed preferredDate", () => {
  const result = validateAppointmentInput({ ...VALID_INPUT, preferredDate: "26/08/2026" }, { now: NOW });
  assert.equal(result.valid, false);
  assert.ok(result.errors.preferredDate);
});

test("validateAppointmentInput rejects a preferredDate in the past", () => {
  const result = validateAppointmentInput({ ...VALID_INPUT, preferredDate: "2026-08-24" }, { now: NOW });
  assert.equal(result.valid, false);
  assert.match(result.errors.preferredDate, /futuro/);
});

test("validateAppointmentInput rejects a malformed preferredTime", () => {
  assert.equal(validateAppointmentInput({ ...VALID_INPUT, preferredTime: "25:00" }, { now: NOW }).valid, false);
  assert.equal(validateAppointmentInput({ ...VALID_INPUT, preferredTime: "2pm" }, { now: NOW }).valid, false);
});

test("validateAppointmentInput treats message as optional but bounds its length", () => {
  assert.equal(validateAppointmentInput({ ...VALID_INPUT, message: undefined }, { now: NOW }).valid, true);
  const tooLong = validateAppointmentInput({ ...VALID_INPUT, message: "x".repeat(501) }, { now: NOW });
  assert.equal(tooLong.valid, false);
  assert.ok(tooLong.errors.message);
});

test("validateAppointmentInput never throws on garbage input", () => {
  assert.doesNotThrow(() => validateAppointmentInput({}));
  assert.doesNotThrow(() => validateAppointmentInput(null));
  assert.doesNotThrow(() => validateAppointmentInput(undefined));
});
