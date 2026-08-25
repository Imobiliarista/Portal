// frontend/shared/appointments.generated.js
//
// GERADO por scripts/generate-appointments-assets.js a partir de
// modules/appointments/index.js + validation.js — não editar à mão (§41,
// módulo appointments). Regenerar com:
// npm run generate:appointments

export const APPOINTMENT_VISITOR_NAME_MAX_LENGTH = 120;
export const APPOINTMENT_MESSAGE_MAX_LENGTH = 500;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyString(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

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

export function normalizeWhatsAppNumber(raw) {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  // 10-11 dígitos = DDD (2) + telefone (8-9), sem código de país.
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

export function buildDefaultAppointmentMessage(listingTitle) {
  return `Tenho interesse em ${listingTitle}`;
}

export function buildAppointmentMessage({ listingUrl, visitorName, visitorPhone, visitorEmail, message }) {
  const lines = [message, "", `Nome: ${visitorName}`, `Telefone: ${visitorPhone}`];
  if (visitorEmail) lines.push(`E-mail: ${visitorEmail}`);
  if (listingUrl) lines.push(`Imóvel: ${listingUrl}`);
  return lines.join("\n");
}

export function buildAppointmentWhatsAppUrl(input, { brokerWhatsapp, listingUrl } = {}) {
  const { valid, errors } = validateAppointmentInput(input);

  const brokerDigits = normalizeWhatsAppNumber(brokerWhatsapp);
  if (!brokerDigits) {
    return { valid: false, errors: { ...errors, whatsapp: "Corretor sem WhatsApp cadastrado." } };
  }

  if (!valid) return { valid: false, errors };

  const text = buildAppointmentMessage({
    listingUrl,
    visitorName: input.visitorName,
    visitorPhone: input.visitorPhone,
    visitorEmail: input.visitorEmail || null,
    message: input.message,
  });

  return {
    valid: true,
    errors: {},
    url: `https://wa.me/${brokerDigits}?text=${encodeURIComponent(text)}`,
  };
}
