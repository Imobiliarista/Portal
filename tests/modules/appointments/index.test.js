import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWhatsAppNumber,
  buildAppointmentMessage,
  buildAppointmentWhatsAppUrl,
  renderFrontendModuleSource,
} from "../../../modules/appointments/index.js";

const NOW = new Date("2026-08-25T12:00:00Z");

const VALID_INPUT = {
  listingSlug: "apartamento-centro-123",
  visitorName: "Maria Souza",
  visitorPhone: "(43) 99999-8888",
  visitorEmail: "maria@example.com",
  preferredDate: "2026-08-26",
  preferredTime: "14:30",
  message: "Posso levar minha família?",
};

test("normalizeWhatsAppNumber strips formatting and prefixes the Brazil country code when missing", () => {
  assert.equal(normalizeWhatsAppNumber("(43) 99999-9999"), "5543999999999");
  assert.equal(normalizeWhatsAppNumber("43 99999-9999"), "5543999999999");
  assert.equal(normalizeWhatsAppNumber("+55 43 99999-9999"), "5543999999999");
  assert.equal(normalizeWhatsAppNumber("5543999999999"), "5543999999999");
});

test("normalizeWhatsAppNumber returns null for garbage/too-short input, never throws", () => {
  assert.equal(normalizeWhatsAppNumber(""), null);
  assert.equal(normalizeWhatsAppNumber("123"), null);
  assert.equal(normalizeWhatsAppNumber(undefined), null);
  assert.equal(normalizeWhatsAppNumber(null), null);
  assert.equal(normalizeWhatsAppNumber(42), null);
});

test("buildAppointmentMessage includes the listing, visitor, and schedule details", () => {
  const message = buildAppointmentMessage({
    listingTitle: "Apartamento no Centro",
    listingUrl: "https://imobiliarista.net/imovel/apartamento-centro-123",
    visitorName: "Maria Souza",
    visitorPhone: "(43) 99999-8888",
    visitorEmail: "maria@example.com",
    preferredDate: "2026-08-26",
    preferredTime: "14:30",
    message: "Posso levar minha família?",
  });
  assert.match(message, /Apartamento no Centro/);
  assert.match(message, /https:\/\/imobiliarista\.net\/imovel\/apartamento-centro-123/);
  assert.match(message, /26\/08\/2026/);
  assert.match(message, /14:30/);
  assert.match(message, /Maria Souza/);
  assert.match(message, /\(43\) 99999-8888/);
  assert.match(message, /maria@example\.com/);
  assert.match(message, /Posso levar minha família\?/);
});

test("buildAppointmentMessage omits optional lines (email/message) when absent", () => {
  const message = buildAppointmentMessage({
    listingTitle: "Apartamento no Centro",
    listingUrl: null,
    visitorName: "Maria Souza",
    visitorPhone: "(43) 99999-8888",
    visitorEmail: null,
    preferredDate: "2026-08-26",
    preferredTime: "14:30",
    message: null,
  });
  assert.doesNotMatch(message, /Meu e-mail/);
  assert.doesNotMatch(message, /Mensagem:/);
});

test("buildAppointmentWhatsAppUrl — criar agendamento: valid input + broker with WhatsApp produces a wa.me URL", () => {
  const result = buildAppointmentWhatsAppUrl(VALID_INPUT, {
    brokerWhatsapp: "(43) 99999-9999",
    listingTitle: "Apartamento no Centro",
    listingUrl: "https://imobiliarista.net/imovel/apartamento-centro-123",
    now: NOW,
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.ok(result.url.startsWith("https://wa.me/5543999999999?text="));
  const decoded = decodeURIComponent(result.url.split("?text=")[1]);
  assert.match(decoded, /Apartamento no Centro/);
  assert.match(decoded, /Maria Souza/);
});

test("buildAppointmentWhatsAppUrl surfaces field errors without building a URL", () => {
  const result = buildAppointmentWhatsAppUrl(
    { ...VALID_INPUT, visitorName: "" },
    { brokerWhatsapp: "43999999999", now: NOW },
  );
  assert.equal(result.valid, false);
  assert.equal(result.url, undefined);
  assert.ok(result.errors.visitorName);
});

test("buildAppointmentWhatsAppUrl reports a broker with no valid WhatsApp instead of building a broken link", () => {
  const result = buildAppointmentWhatsAppUrl(VALID_INPUT, { brokerWhatsapp: null, now: NOW });
  assert.equal(result.valid, false);
  assert.equal(result.url, undefined);
  assert.ok(result.errors.whatsapp);
});

// Isolamento multitenant reinterpretado para este módulo (ver README#decisões):
// como não há persistência em R2 (o registro é só o redirecionamento para o
// WhatsApp do corretor, nunca um armazenamento consultável), a garantia
// equivalente é que a URL de agendamento de um imóvel sempre resolve para o
// WhatsApp do corretor DAQUELE imóvel — nunca para o número de outro
// corretor processado na mesma sessão do browser.
test("buildAppointmentWhatsAppUrl never mixes up brokers across listings processed in the same session", () => {
  const listingA = { slug: "casa-a", brokerWhatsapp: "11911112222" };
  const listingB = { slug: "casa-b", brokerWhatsapp: "21922223333" };

  const resultA = buildAppointmentWhatsAppUrl(
    { ...VALID_INPUT, listingSlug: listingA.slug },
    { brokerWhatsapp: listingA.brokerWhatsapp, now: NOW },
  );
  const resultB = buildAppointmentWhatsAppUrl(
    { ...VALID_INPUT, listingSlug: listingB.slug },
    { brokerWhatsapp: listingB.brokerWhatsapp, now: NOW },
  );

  assert.ok(resultA.url.startsWith("https://wa.me/5511911112222?"));
  assert.ok(resultB.url.startsWith("https://wa.me/5521922223333?"));
  assert.notEqual(resultA.url, resultB.url);
});

test("renderFrontendModuleSource embeds the functions and config as a standalone ESM module", () => {
  const source = renderFrontendModuleSource();
  assert.match(source, /export const APPOINTMENT_VISITOR_NAME_MAX_LENGTH/);
  assert.match(source, /export function validateAppointmentInput/);
  assert.match(source, /export function normalizeWhatsAppNumber/);
  assert.match(source, /export function buildAppointmentMessage/);
  assert.match(source, /export function buildAppointmentWhatsAppUrl/);
  assert.doesNotMatch(source, /^import /m);
});

test("renderFrontendModuleSource output is loadable and behaves identically to the source functions", async () => {
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = mkdtempSync(join(tmpdir(), "appointments-generated-"));
  const path = join(dir, "appointments.generated.js");
  writeFileSync(path, renderFrontendModuleSource());

  const generated = await import(`file://${path}`);
  const result = generated.buildAppointmentWhatsAppUrl(VALID_INPUT, {
    brokerWhatsapp: "(43) 99999-9999",
    listingTitle: "Apartamento no Centro",
    now: NOW,
  });
  assert.equal(result.valid, true);
  assert.ok(result.url.startsWith("https://wa.me/5543999999999?text="));
});
