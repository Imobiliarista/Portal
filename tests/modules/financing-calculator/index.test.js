import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FINANCING_CALCULATOR_CONFIG,
  validateFinancingInput,
  buildSacSchedule,
  summarizeSchedule,
  calculateFinancing,
  renderFrontendModuleSource,
} from "../../../modules/financing-calculator/index.js";

const VALID_INPUT = {
  propertyValue: 500000,
  downPayment: 150000,
  annualInterestRatePercent: 10.5,
  termMonths: 360,
};

test("validateFinancingInput accepts a well-formed input", () => {
  const result = validateFinancingInput(VALID_INPUT);
  assert.deepEqual(result, { valid: true, errors: {} });
});

test("validateFinancingInput rejects a non-numeric/missing propertyValue", () => {
  const result = validateFinancingInput({ ...VALID_INPUT, propertyValue: "abc" });
  assert.equal(result.valid, false);
  assert.match(result.errors.propertyValue, /valor do imóvel/);
});

test("validateFinancingInput rejects downPayment >= propertyValue", () => {
  const result = validateFinancingInput({ ...VALID_INPUT, downPayment: 500000 });
  assert.equal(result.valid, false);
  assert.match(result.errors.downPayment, /maior ou igual/);
});

test("validateFinancingInput enforces minDownPaymentRatio (§44 config)", () => {
  const result = validateFinancingInput({ ...VALID_INPUT, downPayment: 1000 });
  assert.equal(result.valid, false);
  assert.match(result.errors.downPayment, /Entrada mínima/);
});

test("validateFinancingInput rejects a rate outside the configured range", () => {
  const tooLow = validateFinancingInput({ ...VALID_INPUT, annualInterestRatePercent: 0 });
  const tooHigh = validateFinancingInput({ ...VALID_INPUT, annualInterestRatePercent: 999 });
  assert.equal(tooLow.valid, false);
  assert.equal(tooHigh.valid, false);
});

test("validateFinancingInput rejects a non-integer or out-of-range term", () => {
  assert.equal(validateFinancingInput({ ...VALID_INPUT, termMonths: 6 }).valid, false);
  assert.equal(validateFinancingInput({ ...VALID_INPUT, termMonths: 500 }).valid, false);
  assert.equal(validateFinancingInput({ ...VALID_INPUT, termMonths: 12.5 }).valid, false);
});

test("validateFinancingInput never throws on garbage input", () => {
  assert.doesNotThrow(() => validateFinancingInput({}));
  assert.doesNotThrow(() => validateFinancingInput(null));
  assert.doesNotThrow(() => validateFinancingInput(undefined));
});

test("buildSacSchedule produces one row per month with constant amortization", () => {
  const schedule = buildSacSchedule({ propertyValue: 500000, downPayment: 150000, annualInterestRatePercent: 12, termMonths: 12 });
  assert.equal(schedule.length, 12);
  const amortization = 350000 / 12;
  for (const row of schedule) {
    assert.ok(Math.abs(row.amortization - amortization) < 1e-9);
  }
});

test("buildSacSchedule has decreasing interest/payment and a balance that reaches exactly zero", () => {
  const schedule = buildSacSchedule({ propertyValue: 500000, downPayment: 150000, annualInterestRatePercent: 12, termMonths: 12 });
  for (let i = 1; i < schedule.length; i += 1) {
    assert.ok(schedule[i].interest < schedule[i - 1].interest);
    assert.ok(schedule[i].payment < schedule[i - 1].payment);
  }
  assert.equal(schedule[schedule.length - 1].balance, 0);
});

test("buildSacSchedule with 0% interest degrades to flat installments equal to the amortization", () => {
  const schedule = buildSacSchedule({ propertyValue: 500000, downPayment: 150000, annualInterestRatePercent: 0, termMonths: 10 });
  for (const row of schedule) {
    assert.ok(Math.abs(row.interest) < 1e-9);
    assert.ok(Math.abs(row.payment - row.amortization) < 1e-9);
  }
});

test("summarizeSchedule aggregates first/last payment and totals", () => {
  const schedule = buildSacSchedule({ propertyValue: 500000, downPayment: 150000, annualInterestRatePercent: 12, termMonths: 12 });
  const summary = summarizeSchedule(schedule);
  assert.equal(summary.firstPayment, schedule[0].payment);
  assert.equal(summary.lastPayment, schedule[schedule.length - 1].payment);
  assert.ok(summary.totalPaid > summary.totalInterest);
  assert.ok(Math.abs(summary.totalPaid - schedule.reduce((sum, row) => sum + row.payment, 0)) < 1e-9);
});

test("summarizeSchedule returns zeros for an empty/invalid schedule", () => {
  assert.deepEqual(summarizeSchedule([]), { firstPayment: 0, lastPayment: 0, totalInterest: 0, totalPaid: 0 });
  assert.deepEqual(summarizeSchedule(null), { firstPayment: 0, lastPayment: 0, totalInterest: 0, totalPaid: 0 });
});

test("calculateFinancing returns errors (no schedule) for invalid input", () => {
  const result = calculateFinancing({ ...VALID_INPUT, propertyValue: -1 });
  assert.equal(result.valid, false);
  assert.equal(result.schedule, undefined);
  assert.ok(result.errors.propertyValue);
});

test("calculateFinancing returns financedAmount + schedule + summary for valid input", () => {
  const result = calculateFinancing(VALID_INPUT);
  assert.equal(result.valid, true);
  assert.equal(result.financedAmount, 350000);
  assert.equal(result.schedule.length, 360);
  assert.equal(result.summary.firstPayment, result.schedule[0].payment);
});

test("calculateFinancing honors a custom config (e.g. a lower minDownPaymentRatio)", () => {
  const looseConfig = { ...FINANCING_CALCULATOR_CONFIG, minDownPaymentRatio: 0 };
  const result = calculateFinancing({ ...VALID_INPUT, downPayment: 100 }, looseConfig);
  assert.equal(result.valid, true);
});

test("renderFrontendModuleSource embeds the functions and config as a standalone ESM module", () => {
  const source = renderFrontendModuleSource();
  assert.match(source, /export const FINANCING_CALCULATOR_CONFIG/);
  assert.match(source, /export function validateFinancingInput/);
  assert.match(source, /export function buildSacSchedule/);
  assert.match(source, /export function summarizeSchedule/);
  assert.match(source, /export function calculateFinancing/);
  assert.doesNotMatch(source, /^import /m);
});

test("renderFrontendModuleSource output is loadable and behaves identically to the source functions", async () => {
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = mkdtempSync(join(tmpdir(), "financing-calculator-generated-"));
  const path = join(dir, "financing-calculator.generated.js");
  writeFileSync(path, renderFrontendModuleSource());

  const generated = await import(`file://${path}`);
  const result = generated.calculateFinancing(VALID_INPUT);
  assert.equal(result.valid, true);
  assert.equal(result.financedAmount, 350000);
  assert.equal(result.schedule.length, 360);
});
