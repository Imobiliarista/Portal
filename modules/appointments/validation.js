// modules/appointments/validation.js
//
// Módulo appointments (§41) — validação por campo do formulário de
// agendamento de visita. Separado de index.js porque §41 lista
// `validation.js` explicitamente na árvore de arquivos do módulo (mesmo
// espírito de `core/validation.js`, mas específico deste módulo — nunca o
// inverso, §39).
//
// Mesma convenção de outros módulos desta etapa (comparison,
// financing-calculator): nunca lança, sempre devolve
// `{ valid, errors }` com `errors` só nos campos inválidos — entrada de
// formulário mal preenchida é esperada, não um bug.

export const APPOINTMENT_VISITOR_NAME_MAX_LENGTH = 120;
export const APPOINTMENT_MESSAGE_MAX_LENGTH = 500;

// Exportadas (embora "privadas" na intenção) só para
// modules/appointments/index.js#renderFrontendModuleSource poder embutir
// (`.toString()`) essas peças no bundle standalone gerado — mesmo padrão
// de modules/publications/index.js, que faz o mesmo com seus helpers de
// parsing de XML. Nunca importadas fora deste módulo.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isNonEmptyString(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

/** Compara só a data (ignora hora) para não rejeitar "hoje" por causa do relógio do visitante. */
export function isTodayOrLater(dateString, now) {
  const today = new Date(now);
  const todayLocalIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return dateString >= todayLocalIso;
}

/**
 * Valida os campos do formulário de agendamento (§41: "quem agenda
 * (visitante, sem login), qual imóvel, data/horário pretendido, dados de
 * contato"). `now` é injetável para os testes controlarem "hoje" — default
 * `new Date()`.
 *
 * Campos: `listingSlug` (obrigatório — o imóvel sendo visitado, reaproveita
 * o slug já existente de business/listings.js, nunca um id novo, ver
 * README), `visitorName`/`visitorPhone` (obrigatórios — dados de contato
 * mínimos), `visitorEmail` (opcional), `preferredDate`/`preferredTime`
 * (obrigatórios), `message` (opcional).
 *
 * Não valida horário comercial nem bloqueia datas específicas — §41 não
 * define regras de agenda/disponibilidade do corretor, e inventar uma
 * regra de negócio não pedida está fora do escopo deste lote (ver
 * pendências no README).
 */
export function validateAppointmentInput(input, { now = new Date() } = {}) {
  const errors = {};

  if (!isNonEmptyString(input?.listingSlug, 200) || !SLUG_PATTERN.test(input.listingSlug)) {
    errors.listingSlug = "Imóvel inválido.";
  }

  if (!isNonEmptyString(input?.visitorName, APPOINTMENT_VISITOR_NAME_MAX_LENGTH)) {
    errors.visitorName = "Informe seu nome.";
  }

  if (!isNonEmptyString(input?.visitorPhone, 40)) {
    errors.visitorPhone = "Informe um telefone para contato.";
  }

  if (input?.visitorEmail !== undefined && input.visitorEmail !== "" && input.visitorEmail !== null) {
    if (typeof input.visitorEmail !== "string" || !EMAIL_PATTERN.test(input.visitorEmail)) {
      errors.visitorEmail = "E-mail inválido.";
    }
  }

  if (typeof input?.preferredDate !== "string" || !DATE_PATTERN.test(input.preferredDate)) {
    errors.preferredDate = "Informe uma data válida.";
  } else if (!isTodayOrLater(input.preferredDate, now)) {
    errors.preferredDate = "A data precisa ser hoje ou no futuro.";
  }

  if (typeof input?.preferredTime !== "string" || !TIME_PATTERN.test(input.preferredTime)) {
    errors.preferredTime = "Informe um horário válido.";
  }

  if (input?.message !== undefined && input.message !== "" && input.message !== null) {
    if (typeof input.message !== "string" || input.message.length > APPOINTMENT_MESSAGE_MAX_LENGTH) {
      errors.message = `Mensagem muito longa (máximo ${APPOINTMENT_MESSAGE_MAX_LENGTH} caracteres).`;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
