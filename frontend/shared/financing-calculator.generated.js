// frontend/shared/financing-calculator.generated.js
//
// GERADO por scripts/generate-financing-calculator-assets.js a partir de
// modules/financing-calculator/index.js + config.js — não editar à mão
// (§44, módulo financing-calculator). Regenerar com:
// npm run generate:financing-calculator

export const FINANCING_CALCULATOR_CONFIG = {"defaultAnnualInterestRatePercent":10.5,"minAnnualInterestRatePercent":0.1,"maxAnnualInterestRatePercent":30,"defaultTermMonths":360,"minTermMonths":12,"maxTermMonths":420,"minDownPaymentRatio":0.2};

export function validateFinancingInput(input, config = FINANCING_CALCULATOR_CONFIG) {
  const errors = {};
  const propertyValue = Number(input?.propertyValue);
  const downPayment = Number(input?.downPayment);
  const annualInterestRatePercent = Number(input?.annualInterestRatePercent);
  const termMonths = Number(input?.termMonths);

  if (!Number.isFinite(propertyValue) || propertyValue <= 0) {
    errors.propertyValue = "Informe o valor do imóvel.";
  }

  if (!Number.isFinite(downPayment) || downPayment < 0) {
    errors.downPayment = "Informe o valor de entrada.";
  } else if (Number.isFinite(propertyValue) && propertyValue > 0) {
    const minDownPayment = propertyValue * config.minDownPaymentRatio;
    if (downPayment >= propertyValue) {
      errors.downPayment = "A entrada não pode ser maior ou igual ao valor do imóvel.";
    } else if (downPayment < minDownPayment) {
      errors.downPayment = `Entrada mínima de ${Math.round(config.minDownPaymentRatio * 100)}% do valor do imóvel.`;
    }
  }

  if (
    !Number.isFinite(annualInterestRatePercent) ||
    annualInterestRatePercent < config.minAnnualInterestRatePercent ||
    annualInterestRatePercent > config.maxAnnualInterestRatePercent
  ) {
    errors.annualInterestRatePercent = `Taxa entre ${config.minAnnualInterestRatePercent}% e ${config.maxAnnualInterestRatePercent}% ao ano.`;
  }

  if (
    !Number.isInteger(termMonths) ||
    termMonths < config.minTermMonths ||
    termMonths > config.maxTermMonths
  ) {
    errors.termMonths = `Prazo entre ${config.minTermMonths} e ${config.maxTermMonths} meses.`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function buildSacSchedule(input) {
  const propertyValue = Number(input.propertyValue);
  const downPayment = Number(input.downPayment);
  const termMonths = Math.trunc(Number(input.termMonths));
  const annualInterestRatePercent = Number(input.annualInterestRatePercent);

  const financedAmount = propertyValue - downPayment;
  const monthlyInterestRate = (1 + annualInterestRatePercent / 100) ** (1 / 12) - 1;
  const amortization = financedAmount / termMonths;

  const schedule = [];
  let balance = financedAmount;
  for (let month = 1; month <= termMonths; month += 1) {
    const interest = balance * monthlyInterestRate;
    const payment = amortization + interest;
    balance = month === termMonths ? 0 : balance - amortization;
    schedule.push({ month, payment, amortization, interest, balance });
  }
  return schedule;
}

export function summarizeSchedule(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return { firstPayment: 0, lastPayment: 0, totalInterest: 0, totalPaid: 0 };
  }
  const totalInterest = schedule.reduce((sum, row) => sum + row.interest, 0);
  const totalPaid = schedule.reduce((sum, row) => sum + row.payment, 0);
  return {
    firstPayment: schedule[0].payment,
    lastPayment: schedule[schedule.length - 1].payment,
    totalInterest,
    totalPaid,
  };
}

export function calculateFinancing(input, config = FINANCING_CALCULATOR_CONFIG) {
  const { valid, errors } = validateFinancingInput(input, config);
  if (!valid) return { valid: false, errors };

  const schedule = buildSacSchedule(input);
  const summary = summarizeSchedule(schedule);
  return {
    valid: true,
    errors: {},
    financedAmount: Number(input.propertyValue) - Number(input.downPayment),
    schedule,
    summary,
  };
}
