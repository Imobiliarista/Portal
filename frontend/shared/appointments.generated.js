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
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isNonEmptyString(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isTodayOrLater(dateString, now) {
  const today = new Date(now);
  const todayLocalIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return dateString >= todayLocalIso;
}

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

export function normalizeWhatsAppNumber(raw) {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  // 10-11 dígitos = DDD (2) + telefone (8-9), sem código de país.
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

export function buildAppointmentMessage({
  listingTitle,
  listingUrl,
  visitorName,
  visitorPhone,
  visitorEmail,
  preferredDate,
  preferredTime,
  message,
}) {
  const [year, month, day] = preferredDate.split("-");
  const dateLabel = `${day}/${month}/${year}`;

  const lines = [
    "Olá! Tenho interesse em agendar uma visita.",
    "",
    `Imóvel: ${listingTitle}`,
  ];
  if (listingUrl) lines.push(listingUrl);
  lines.push(
    "",
    `Data pretendida: ${dateLabel}`,
    `Horário pretendido: ${preferredTime}`,
    "",
    `Meu nome: ${visitorName}`,
    `Meu telefone: ${visitorPhone}`,
  );
  if (visitorEmail) lines.push(`Meu e-mail: ${visitorEmail}`);
  if (message) lines.push("", `Mensagem: ${message}`);

  return lines.join("\n");
}

export function buildAppointmentWhatsAppUrl(input, { brokerWhatsapp, listingTitle, listingUrl, now } = {}) {
  const { valid, errors } = validateAppointmentInput(input, { now });

  const brokerDigits = normalizeWhatsAppNumber(brokerWhatsapp);
  if (!brokerDigits) {
    return { valid: false, errors: { ...errors, whatsapp: "Corretor sem WhatsApp cadastrado." } };
  }

  if (!valid) return { valid: false, errors };

  const text = buildAppointmentMessage({
    listingTitle: listingTitle || input.listingSlug,
    listingUrl,
    visitorName: input.visitorName,
    visitorPhone: input.visitorPhone,
    visitorEmail: input.visitorEmail || null,
    preferredDate: input.preferredDate,
    preferredTime: input.preferredTime,
    message: input.message || null,
  });

  return {
    valid: true,
    errors: {},
    url: `https://wa.me/${brokerDigits}?text=${encodeURIComponent(text)}`,
  };
}
