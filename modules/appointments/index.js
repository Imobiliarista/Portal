// modules/appointments/index.js
//
// Módulo appointments (§41) — ponto de entrada.
//
// §41 no documento normativo é só a árvore de arquivos do módulo, sem
// nenhuma linha sobre o fluxo em si. Decisões de produto confirmadas com
// o solicitante antes deste lote (ver modules/appointments/README.md#decisões
// para o texto completo — inclui uma correção feita já durante o lote,
// depois de uma primeira leitura errada de "agendamento" como marcação de
// data/horário):
//
//   1. Não é um agendamento com data/horário — é um formulário de
//      **contato geral** com o corretor a partir de um imóvel, mesmo
//      padrão do template Houzez: nome, telefone, e-mail, mensagem
//      pré-preenchida ("Tenho interesse em {título}") e livremente
//      editável pelo visitante. Sem campo de data/horário — prática de
//      mercado atual, não uma leitura literal de "agendamento".
//   2. Ao enviar, o formulário monta a mensagem e abre
//      `https://wa.me/{numero-do-corretor}?text=...` — 100% client-side,
//      nenhuma aprovação/confirmação dentro da plataforma, nenhum estado
//      "pendente"/"confirmado".
//   3. Não existe (e não foi adicionada) nenhuma infraestrutura de e-mail
//      no projeto — a notificação do corretor é só esse redirecionamento
//      para o WhatsApp dele, usando o campo `whatsapp` que já existe no
//      perfil público do corretor (§16, schemas/broker-public.schema.json,
//      já suportado por business/brokers.js desde a Etapa 3 — nenhuma
//      mudança necessária ali). Nenhuma API/integração de WhatsApp
//      Business foi adicionada.
//
// Consequência arquitetural: como não há nada para persistir, este
// módulo não tem rota de Worker nem gaveta em R2 PRIVATE. Mesmo espírito
// de simplicidade dos módulos comparison/financing-calculator (§94: "pode
// ser Browser?" — aqui, sim).
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
  isNonEmptyString,
} from "./validation.js";

export { validateAppointmentInput, APPOINTMENT_VISITOR_NAME_MAX_LENGTH, APPOINTMENT_MESSAGE_MAX_LENGTH };

/**
 * Reduz um número de WhatsApp em texto livre (broker.whatsapp,
 * schemas/broker-public.schema.json — sem formato definido, corretor
 * digita como quiser: "(43) 99999-9999", "43 99999-9999", "+55 43
 * 99999-9999") a só dígitos, prefixando o código do Brasil (55) quando
 * ausente. Devolve `null` para entrada claramente inválida (poucos
 * dígitos) em vez de lançar — um corretor sem WhatsApp válido no perfil
 * simplesmente não pode receber contato por este canal (ver
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
 * Texto padrão que a UI usa para pré-preencher o campo de mensagem —
 * puro e testável para não duplicar a string em frontend/portal/
 * components/appointments.js. O visitante pode reescrever livremente
 * (decisão 1 do README); isto é só o valor inicial do campo.
 */
export function buildDefaultAppointmentMessage(listingTitle) {
  return `Tenho interesse em ${listingTitle}`;
}

/**
 * Monta o texto final enviado ao WhatsApp a partir dos dados do
 * formulário (já validados) — a mensagem do visitante primeiro (já traz
 * o contexto do imóvel, via buildDefaultAppointmentMessage ou reescrita
 * livre), seguida dos dados de contato e do link do imóvel.
 * `listingUrl` é resolvida pela UI (portal e minisite têm hosts
 * diferentes, §18/§74) — este módulo não assume nenhum host.
 */
export function buildAppointmentMessage({ listingUrl, visitorName, visitorPhone, visitorEmail, message }) {
  const lines = [message, "", `Nome: ${visitorName}`, `Telefone: ${visitorPhone}`];
  if (visitorEmail) lines.push(`E-mail: ${visitorEmail}`);
  if (listingUrl) lines.push(`Imóvel: ${listingUrl}`);
  return lines.join("\n");
}

/**
 * Ponto de entrada único consumido pela UI: valida `input` e, se válido e
 * o corretor tiver um WhatsApp resolvível, monta a URL `https://wa.me/...`
 * pronta para `window.open`. Nunca lança — `{ valid: false, errors }` cobre
 * tanto erro de campo quanto "corretor sem WhatsApp válido" (`errors.whatsapp`).
 */
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

${isNonEmptyString.toString()}

export ${validateAppointmentInput.toString()}

export ${normalizeWhatsAppNumber.toString()}

export ${buildDefaultAppointmentMessage.toString()}

export ${buildAppointmentMessage.toString()}

export ${buildAppointmentWhatsAppUrl.toString()}
`;
}
