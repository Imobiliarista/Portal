// modules/financing-calculator/index.js
//
// Módulo financing-calculator (§44) — 100% client-side: "preferir
// client-side sempre que possível" / "se puro frontend, não criar rota
// Worker desnecessária". O cálculo (tabela SAC — Sistema de Amortização
// Constante, a mais comum em financiamento imobiliário no Brasil) só
// depende de 4 números que o próprio visitante digita (valor do imóvel,
// entrada, taxa de juros anual, prazo) — nenhum dado de corretor/imóvel
// além do preço de tabela já público no `listings/{slug}.json`
// (schemas/listing-public.schema.json, §15), então não há razão para uma
// rota de Worker nem para persistir nada em R2/KV.
//
// Como o browser só alcança `frontend/` (Workers Static Assets —
// wrangler.toml `[assets] directory = "frontend"`; mesma restrição
// documentada em modules/pwa e modules/comparison), este arquivo não é
// importado diretamente pelo frontend. `renderFrontendModuleSource`
// embute (`.toString()`, nunca redigitado) as funções abaixo — testadas
// aqui em Node — num ESM standalone que
// scripts/generate-financing-calculator-assets.js grava em
// frontend/shared/financing-calculator.generated.js (Static Asset real). A
// camada de DOM (formulário, tabela) fica em
// frontend/portal/components/financing-calculator.js, que reaproveita
// `formatPrice` de ../render.js — mesma divisão de responsabilidade do
// módulo comparison (ver header de modules/comparison/index.js).

import { FINANCING_CALCULATOR_CONFIG } from "./config.js";

export { FINANCING_CALCULATOR_CONFIG };

/**
 * Valida os 4 campos do formulário contra `config` (limites de
 * modules/financing-calculator/config.js). Devolve `{ valid, errors }` —
 * `errors` é um objeto `{ campo: mensagem }` só com os campos inválidos,
 * nunca lança (entrada não-numérica vira erro de validação, não exceção).
 */
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

/**
 * Monta a tabela SAC (amortização constante, juros decrescentes) —
 * assume `input` já validado por `validateFinancingInput`. Taxa mensal
 * obtida por conversão composta (`(1 + anual)^(1/12) - 1`, convenção
 * usual de financiamento imobiliário no Brasil), não divisão simples por
 * 12. Cada linha: `{ month, payment, amortization, interest, balance }`,
 * saldo devedor zerado explicitamente na última parcela para não sobrar
 * resíduo de ponto flutuante.
 */
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

/** Agrega a tabela SAC num resumo para exibição sem rolar a tabela inteira. */
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

/**
 * Ponto de entrada único consumido pela UI (§44): valida e, se válido,
 * calcula. `{ valid: false, errors }` ou
 * `{ valid: true, errors: {}, financedAmount, schedule, summary }`.
 */
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

/**
 * Gera o texto completo (standalone ESM, sem imports) de
 * frontend/shared/financing-calculator.generated.js. Mesmo padrão de
 * modules/comparison/index.js#renderFrontendModuleSource: o código
 * testado aqui em Node é literalmente o que roda no browser.
 */
export function renderFrontendModuleSource() {
  return `// frontend/shared/financing-calculator.generated.js
//
// GERADO por scripts/generate-financing-calculator-assets.js a partir de
// modules/financing-calculator/index.js + config.js — não editar à mão
// (§44, módulo financing-calculator). Regenerar com:
// npm run generate:financing-calculator

export const FINANCING_CALCULATOR_CONFIG = ${JSON.stringify(FINANCING_CALCULATOR_CONFIG)};

export ${validateFinancingInput.toString()}

export ${buildSacSchedule.toString()}

export ${summarizeSchedule.toString()}

export ${calculateFinancing.toString()}
`;
}
