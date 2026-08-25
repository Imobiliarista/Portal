// frontend/portal/components/appointments.js
//
// Camada de DOM do módulo appointments (§41) — um formulário de contato
// geral (nome, telefone, e-mail opcional, mensagem pré-preenchida e
// editável) na página de imóvel completo que, ao ser enviado, abre o
// WhatsApp do corretor com a mensagem pronta (mesmo padrão do template
// Houzez — ver decisão 1 de modules/appointments/README.md; não é um
// agendamento com data/horário). Lógica pura (validação, montagem da
// mensagem/URL) vive em modules/appointments/index.js + validation.js e
// chega ao browser como frontend/shared/appointments.generated.js — mesma
// divisão de responsabilidade dos módulos comparison/financing-calculator.
//
// Deliberadamente fora de ../render.js#renderListingDetail (que
// frontend/minisite/app.js também chama): montado depois, via
// `container.append`, a partir de cada app.js — mesmo padrão "appended
// after the fact" de components/financing-calculator.js (evita import
// circular: este arquivo importa `formatPrice`/`buildListingUrl` de
// ../render.js).
//
// Não unit-testado — mesma convenção da camada de DOM de render.js/
// components/financing-calculator.js — verificado visualmente via
// `wrangler dev` (§90 Etapa 2).

import {
  buildAppointmentWhatsAppUrl,
  buildDefaultAppointmentMessage,
  normalizeWhatsAppNumber,
} from "../../shared/appointments.generated.js";

function el(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) if (child) node.append(child);
  return node;
}

function field(labelText, tag, inputAttrs) {
  const input = el(tag, { className: "imob-appointments__input", attrs: inputAttrs });
  const errorEl = el("p", { className: "imob-appointments__error" });
  const wrapper = el("label", { className: "imob-appointments__field" }, [
    el("span", { text: labelText }),
    input,
    errorEl,
  ]);
  return { wrapper, input, errorEl };
}

function readInputValues(fields) {
  return {
    visitorName: fields.visitorName.input.value,
    visitorPhone: fields.visitorPhone.input.value,
    visitorEmail: fields.visitorEmail.input.value,
    message: fields.message.input.value,
  };
}

function paintErrors(fields, errors) {
  for (const key of Object.keys(fields)) {
    fields[key].errorEl.textContent = errors[key] ?? "";
    fields[key].input.classList.toggle("is-invalid", Boolean(errors[key]));
  }
}

/**
 * Monta a seção "Fale com o corretor" e a anexa a `container` (imóvel
 * completo). `listing` é o `listings/{slug}.json` já carregado pela
 * página (§15) — a referência do imóvel no contato é sempre
 * `listing.slug`, nunca um identificador novo (consome business/listings.js
 * indiretamente, via a mesma projeção pública que a página já usa).
 * `brokerWhatsapp` é `broker.whatsapp` do perfil público do corretor dono
 * do anúncio (§16) — resolvido pela UI (portal busca o perfil à parte;
 * minisite já tem o perfil carregado, ver os respectivos app.js).
 *
 * Se o corretor não tiver um WhatsApp válido cadastrado, a seção não é
 * renderizada — mesmo espírito de "§49 se inexistente, componente não
 * renderiza" — não existe fallback de e-mail/telefone neste lote (ver
 * README#pendências).
 */
export function mountAppointmentForm(container, { listing, brokerWhatsapp } = {}) {
  if (!listing?.slug || !normalizeWhatsAppNumber(brokerWhatsapp)) return null;

  const listingUrl = typeof location !== "undefined" ? `${location.origin}/imovel/${listing.slug}` : "";

  const fields = {
    visitorName: field("Seu nome", "input", { type: "text" }),
    visitorPhone: field("Seu telefone (WhatsApp)", "input", { type: "tel" }),
    visitorEmail: field("Seu e-mail (opcional)", "input", { type: "email" }),
    message: field("Mensagem", "textarea", { rows: "4" }),
  };
  fields.message.input.value = buildDefaultAppointmentMessage(listing.title);
  fields.message.wrapper.classList.add("imob-appointments__field--full");

  const submitButton = el("button", {
    className: "imob-appointments__submit",
    text: "Falar com o corretor via WhatsApp",
    attrs: { type: "submit" },
  });

  const form = el(
    "form",
    { className: "imob-appointments__form" },
    [
      fields.visitorName.wrapper,
      fields.visitorPhone.wrapper,
      fields.visitorEmail.wrapper,
      fields.message.wrapper,
      submitButton,
    ],
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = { ...readInputValues(fields), listingSlug: listing.slug };
    const result = buildAppointmentWhatsAppUrl(input, { brokerWhatsapp, listingUrl });
    paintErrors(fields, result.errors);
    if (!result.valid) return;
    window.open(result.url, "_blank", "noopener");
  });

  const section = el("section", { className: "imob-appointments" }, [
    el("h2", { text: "Fale com o corretor" }),
    form,
  ]);

  container.append(section);
  return section;
}
