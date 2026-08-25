// modules/appointments/validation.js
//
// Módulo appointments (§41) — validação por campo do formulário de
// contato geral com o corretor a partir de um imóvel. Separado de
// index.js porque §41 lista `validation.js` explicitamente na árvore de
// arquivos do módulo (mesmo espírito de `core/validation.js`, mas
// específico deste módulo — nunca o inverso, §39).
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

export function isNonEmptyString(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

/**
 * Valida os campos do formulário de contato (§41 — corrigido pelo
 * solicitante durante este lote: não é agendamento com data/horário, é um
 * formulário de contato geral com o corretor, mesmo padrão do template
 * Houzez — nome, telefone, e-mail, mensagem pré-preenchida e editável).
 *
 * Campos: `listingSlug` (obrigatório — o imóvel de onde o contato partiu,
 * reaproveita o slug já existente de business/listings.js, nunca um id
 * novo, ver README), `visitorName`/`visitorPhone` (obrigatórios — dados
 * de contato mínimos), `visitorEmail` (opcional), `message` (obrigatório
 * — é o conteúdo principal do contato; a UI pré-preenche com "Tenho
 * interesse em {título do imóvel}", mas o visitante pode reescrever
 * livremente, nunca fica travado nesse texto).
 */
export function validateAppointmentInput(input) {
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

  if (!isNonEmptyString(input?.message, APPOINTMENT_MESSAGE_MAX_LENGTH)) {
    errors.message = input?.message && input.message.length > APPOINTMENT_MESSAGE_MAX_LENGTH
      ? `Mensagem muito longa (máximo ${APPOINTMENT_MESSAGE_MAX_LENGTH} caracteres).`
      : "Escreva uma mensagem para o corretor.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
