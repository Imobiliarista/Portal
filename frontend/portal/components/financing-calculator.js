// frontend/portal/components/financing-calculator.js
//
// DOM layer of the financing-calculator module (§44) — a form (valor do
// imóvel, entrada, taxa, prazo) plus a results summary and a collapsible
// full SAC table, mounted on the imóvel completo page. Pure logic
// (validation, SAC schedule, config) lives in
// modules/financing-calculator/index.js + config.js and reaches the
// browser as frontend/shared/financing-calculator.generated.js — same
// split as ../render.js (view-model vs DOM mounting) and every other
// Etapa 9 module (comparison, tour-360, video-youtube).
//
// Deliberately kept out of ../render.js#renderListingDetail (which
// frontend/minisite/app.js also calls): appended after the fact from both
// frontend/portal/app.js and frontend/minisite/app.js instead, so this
// file can import `formatPrice` from ../render.js without a circular
// import (render.js would otherwise import this file, which imports
// render.js back) — same reasoning as modules/comparison's
// components/comparison.js.
//
// Not unit-tested, same convention as the DOM-mounting half of
// ../render.js (see its header comment) — verified visually per §90
// Etapa 2's "start the dev server and use the feature in a browser".

import {
  FINANCING_CALCULATOR_CONFIG,
  calculateFinancing,
} from "../../shared/financing-calculator.generated.js";
import { formatPrice } from "../render.js";

function el(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) if (child) node.append(child);
  return node;
}

function field(labelText, inputAttrs) {
  const input = el("input", { className: "imob-financing-calculator__input", attrs: inputAttrs });
  const errorEl = el("p", { className: "imob-financing-calculator__error" });
  const wrapper = el("label", { className: "imob-financing-calculator__field" }, [
    el("span", { text: labelText }),
    input,
    errorEl,
  ]);
  return { wrapper, input, errorEl };
}

function readInputValues(fields) {
  return {
    propertyValue: fields.propertyValue.input.value,
    downPayment: fields.downPayment.input.value,
    annualInterestRatePercent: fields.annualInterestRatePercent.input.value,
    termMonths: fields.termMonths.input.value,
  };
}

function paintErrors(fields, errors) {
  for (const key of Object.keys(fields)) {
    fields[key].errorEl.textContent = errors[key] ?? "";
    fields[key].input.classList.toggle("is-invalid", Boolean(errors[key]));
  }
}

function renderSummary(container, { financedAmount, summary }) {
  container.replaceChildren(
    el("dl", { className: "imob-financing-calculator__summary" }, [
      el("dt", { text: "Valor financiado" }),
      el("dd", { text: formatPrice(financedAmount) }),
      el("dt", { text: "1ª parcela" }),
      el("dd", { text: formatPrice(summary.firstPayment) }),
      el("dt", { text: "Última parcela" }),
      el("dd", { text: formatPrice(summary.lastPayment) }),
      el("dt", { text: "Total de juros" }),
      el("dd", { text: formatPrice(summary.totalInterest) }),
      el("dt", { text: "Total pago" }),
      el("dd", { text: formatPrice(summary.totalPaid) }),
    ]),
  );
}

function renderScheduleTable(schedule) {
  const rows = schedule.map((row) =>
    el("tr", {}, [
      el("td", { text: String(row.month) }),
      el("td", { text: formatPrice(row.payment) }),
      el("td", { text: formatPrice(row.amortization) }),
      el("td", { text: formatPrice(row.interest) }),
      el("td", { text: formatPrice(row.balance) }),
    ]),
  );
  return el("table", { className: "imob-financing-calculator__table" }, [
    el("thead", {}, [
      el("tr", {}, [
        el("th", { text: "Mês" }),
        el("th", { text: "Parcela" }),
        el("th", { text: "Amortização" }),
        el("th", { text: "Juros" }),
        el("th", { text: "Saldo devedor" }),
      ]),
    ]),
    el("tbody", {}, rows),
  ]);
}

/**
 * Mounts the financing-calculator section (§44) and appends it to
 * `container` (imóvel completo page). `propertyValue` (raw number,
 * `listing.price`) pre-fills the form when the listing has a numeric
 * price (§44's calculator works from "valor/entrada/taxa/prazo" —
 * "valor" defaults to the listing's own price but stays editable, since a
 * visitor may want to simulate a different amount).
 */
export function mountFinancingCalculator(container, { propertyValue } = {}) {
  const config = FINANCING_CALCULATOR_CONFIG;

  const fields = {
    propertyValue: field("Valor do imóvel (R$)", {
      type: "number",
      min: "0",
      step: "1000",
      value: typeof propertyValue === "number" ? String(propertyValue) : "",
    }),
    downPayment: field("Entrada (R$)", { type: "number", min: "0", step: "1000" }),
    annualInterestRatePercent: field("Taxa de juros anual (%)", {
      type: "number",
      min: "0",
      step: "0.1",
      value: String(config.defaultAnnualInterestRatePercent),
    }),
    termMonths: field("Prazo (meses)", {
      type: "number",
      min: String(config.minTermMonths),
      max: String(config.maxTermMonths),
      step: "1",
      value: String(config.defaultTermMonths),
    }),
  };

  const submitButton = el("button", {
    className: "imob-financing-calculator__submit",
    text: "Calcular",
    attrs: { type: "submit" },
  });

  const summaryEl = el("div", { className: "imob-financing-calculator__result" });
  const scheduleContainer = el("div", { className: "imob-financing-calculator__schedule", attrs: { hidden: "true" } });
  const toggleButton = el("button", {
    className: "imob-financing-calculator__toggle",
    text: "Ver tabela completa (SAC)",
    attrs: { type: "button", hidden: "true" },
  });

  toggleButton.addEventListener("click", () => {
    const nowHidden = !scheduleContainer.hidden;
    scheduleContainer.hidden = nowHidden;
    toggleButton.textContent = nowHidden ? "Ver tabela completa (SAC)" : "Ocultar tabela completa";
  });

  const form = el(
    "form",
    { className: "imob-financing-calculator__form" },
    [fields.propertyValue.wrapper, fields.downPayment.wrapper, fields.annualInterestRatePercent.wrapper, fields.termMonths.wrapper, submitButton],
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = calculateFinancing(readInputValues(fields), config);
    paintErrors(fields, result.errors);
    if (!result.valid) {
      summaryEl.replaceChildren();
      scheduleContainer.hidden = true;
      toggleButton.hidden = true;
      return;
    }
    renderSummary(summaryEl, result);
    scheduleContainer.replaceChildren(renderScheduleTable(result.schedule));
    scheduleContainer.hidden = true;
    toggleButton.hidden = false;
    toggleButton.textContent = "Ver tabela completa (SAC)";
  });

  const section = el("section", { className: "imob-financing-calculator" }, [
    el("h2", { text: "Simule o financiamento" }),
    form,
    summaryEl,
    toggleButton,
    scheduleContainer,
  ]);

  container.append(section);
  return section;
}
