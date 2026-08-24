// modules/financing-calculator/config.js
//
// Módulo financing-calculator (§44) — parâmetros configuráveis da
// calculadora, num arquivo separado de index.js porque §44 lista
// `config.js` explicitamente na árvore de arquivos do módulo. Só
// referências de mercado para financiamento imobiliário (SAC) no Brasil —
// nenhum valor vem de core/business/storage, nenhuma oferta real de
// nenhuma instituição financeira. Ajustar aqui não muda a fórmula de
// cálculo em index.js, só os limites/valores padrão do formulário.

export const FINANCING_CALCULATOR_CONFIG = Object.freeze({
  /** Taxa de juros efetiva anual (%) pré-preenchida no formulário. */
  defaultAnnualInterestRatePercent: 10.5,
  /** Faixa aceita pela validação — abaixo/acima disso o formulário rejeita o valor. */
  minAnnualInterestRatePercent: 0.1,
  maxAnnualInterestRatePercent: 30,

  /** Prazo (meses) pré-preenchido no formulário — 360 meses = 30 anos. */
  defaultTermMonths: 360,
  /** Faixa aceita — 420 meses (35 anos) é o teto usual do SFH/SFI no mercado brasileiro. */
  minTermMonths: 12,
  maxTermMonths: 420,

  /** Entrada mínima como fração do valor do imóvel — financiadoras tipicamente exigem 20%+. */
  minDownPaymentRatio: 0.2,
});
