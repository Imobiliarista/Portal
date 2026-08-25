// modules/appointments/index.js
//
// Módulo appointments (§41, agendamento-visita) — ponto de entrada.
//
// §41 no documento normativo é só a árvore de arquivos do módulo, sem
// nenhuma linha sobre o fluxo em si. Duas decisões de produto que o
// documento não cobria foram confirmadas com o solicitante antes deste
// lote (ver modules/appointments/README.md#decisões para o texto
// completo):
//
//   1. O agendamento não é uma aprovação/recusa dentro do sistema — hoje
//      o site do corretor já usa um formulário que, ao ser enviado, abre
//      o WhatsApp do corretor com a mensagem pronta (padrão comum de
//      "agende sua visita" em sites imobiliários, ex. addons Houzez). Este
//      módulo reproduz exatamente esse fluxo: 100% client-side, um link
//      `https://wa.me/{numero}?text=...` — nenhuma aprovação/confirmação
//      dentro da plataforma, nenhum estado "pendente"/"confirmado".
//   2. Não existe (e não foi adicionada) nenhuma infraestrutura de e-mail
//      no projeto — a notificação do corretor é só esse redirecionamento
//      para o WhatsApp dele, usando o campo `whatsapp` que já existe no
//      perfil público do corretor (§16, schemas/broker-public.schema.json).
//      Nenhuma API/integração de WhatsApp Business foi adicionada.
//
// Consequência arquitetural: como não há nada para persistir (§41 sugeria
// "provavelmente uma gaveta nova em R2", mas isso pressupõe o corretor
// aprovando/visualizando agendamentos dentro do painel — não é o fluxo
// real confirmado), este módulo não tem rota de Worker nem gaveta em R2
// PRIVATE. Mesmo espírito de simplicidade dos módulos comparison/
// financing-calculator (§94: "pode ser Browser?" — aqui, sim).
//
// Como o browser só alcança `frontend/` (Static Assets — wrangler.toml
// `[assets] directory = "frontend"`; mesma restrição documentada em
// modules/comparison e modules/financing-calculator), este arquivo não é
// importado diretamente pelo frontend. `renderFrontendModuleSource` embute
// (`.toString()`, nunca redigitado) as funções testadas aqui em Node —
// incluindo a de validation.js — num ESM standalone que
// scripts/generate-appointments-assets.js grava em
// frontend/shared/appointments.generated.js (Static Asset real).

import {
  validateAppointmentInput,
  APPOINTMENT_VISITOR_NAME_MAX_LENGTH,
  APPOINTMENT_MESSAGE_MAX_LENGTH,
  SLUG_PATTERN,
  EMAIL_PATTERN,
  DATE_PATTERN,
  TIME_PATTERN,
  isNonEmptyString,
  isTodayOrLater,
} from "./validation.js";

export { validateAppointmentInput, APPOINTMENT_VISITOR_NAME_MAX_LENGTH, APPOINTMENT_MESSAGE_MAX_LENGTH };

/**
 * Reduz um número de WhatsApp em texto livre (broker.whatsapp,
 * schemas/broker-public.schema.json — sem formato definido, corretor
 * digita como quiser: "(43) 99999-9999", "43 99999-9999", "+55 43
 * 99999-9999") a só dígitos, prefixando o código do Brasil (55) quando
 * ausente. Devolve `null` para entrada claramente inválida (poucos
 * dígitos) em vez de lançar — um corretor sem WhatsApp válido no perfil
 * simplesmente não pode receber agendamento por este canal (ver
 * mountAppointmentForm no componente de UI, que não renderiza o formulário
 * nesse caso — mesmo espírito de "§49 se inexistente, componente não
 * renderiza").
 */
export function normalizeWhatsAppNumber(raw) {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  // 10-11 dígitos = DDD (2) + telefone (8-9), sem código de país.
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

/**
 * Monta o texto da mensagem de WhatsApp a partir dos dados do formulário
 * (já validados) e do contexto do imóvel/visitante. `listingUrl` é
 * resolvida pela UI (portal e minisite têm hosts diferentes, §18/§74) —
 * este módulo não assume nenhum host.
 */
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

/**
 * Ponto de entrada único consumido pela UI: valida `input` e, se válido e
 * o corretor tiver um WhatsApp resolvível, monta a URL `https://wa.me/...`
 * pronta para `window.open`. Nunca lança — `{ valid: false, errors }` cobre
 * tanto erro de campo quanto "corretor sem WhatsApp válido" (`errors.whatsapp`).
 * `now` é repassado a `validateAppointmentInput` (injetável nos testes,
 * default `new Date()`).
 */
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

/**
 * Gera o texto completo (standalone ESM, sem imports) de
 * frontend/shared/appointments.generated.js. Mesmo padrão de
 * modules/comparison e modules/financing-calculator: o código testado
 * aqui em Node é literalmente o que roda no browser.
 */
export function renderFrontendModuleSource() {
  return `// frontend/shared/appointments.generated.js
//
// GERADO por scripts/generate-appointments-assets.js a partir de
// modules/appointments/index.js + validation.js — não editar à mão (§41,
// módulo appointments). Regenerar com:
// npm run generate:appointments

export const APPOINTMENT_VISITOR_NAME_MAX_LENGTH = ${JSON.stringify(APPOINTMENT_VISITOR_NAME_MAX_LENGTH)};
export const APPOINTMENT_MESSAGE_MAX_LENGTH = ${JSON.stringify(APPOINTMENT_MESSAGE_MAX_LENGTH)};

const SLUG_PATTERN = ${SLUG_PATTERN.toString()};
const EMAIL_PATTERN = ${EMAIL_PATTERN.toString()};
const DATE_PATTERN = ${DATE_PATTERN.toString()};
const TIME_PATTERN = ${TIME_PATTERN.toString()};

${isNonEmptyString.toString()}

${isTodayOrLater.toString()}

export ${validateAppointmentInput.toString()}

export ${normalizeWhatsAppNumber.toString()}

export ${buildAppointmentMessage.toString()}

export ${buildAppointmentWhatsAppUrl.toString()}
`;
}
