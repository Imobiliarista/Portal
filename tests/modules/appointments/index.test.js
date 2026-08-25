import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWhatsAppNumber,
  buildDefaultAppointmentMessage,
  buildAppointmentMessage,
  buildAppointmentWhatsAppUrl,
  renderFrontendModuleSource,
} from "../../../modules/appointments/index.js";

const VALID_INPUT = {
  listingSlug: "apartamento-centro-123",
  visitorName: "Maria Souza",
  visitorPhone: "(43) 99999-8888",
  visitorEmail: "maria@example.com",
  message: "Tenho interesse em Apartamento no Centro. Posso levar minha família na visita?",
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

test("buildDefaultAppointmentMessage pre-fills a generic interest message with the listing title", () => {
  assert.equal(buildDefaultAppointmentMessage("Apartamento no Centro"), "Tenho interesse em Apartamento no Centro");
});

test("buildAppointmentMessage leads with the visitor's own message, then contact details and the listing link", () => {
  const message = buildAppointmentMessage({
    listingUrl: "https://imobiliarista.net/imovel/apartamento-centro-123",
    visitorName: "Maria Souza",
    visitorPhone: "(43) 99999-8888",
    visitorEmail: "maria@example.com",
    message: "Tenho interesse em Apartamento no Centro",
  });
  assert.match(message, /^Tenho interesse em Apartamento no Centro/);
  assert.match(message, /Nome: Maria Souza/);
  assert.match(message, /Telefone: \(43\) 99999-8888/);
  assert.match(message, /E-mail: maria@example\.com/);
  assert.match(message, /https:\/\/imobiliarista\.net\/imovel\/apartamento-centro-123/);
});

test("buildAppointmentMessage omits optional lines (email/listing link) when absent", () => {
  const message = buildAppointmentMessage({
    listingUrl: null,
    visitorName: "Maria Souza",
    visitorPhone: "(43) 99999-8888",
    visitorEmail: null,
    message: "Tenho interesse",
  });
  assert.doesNotMatch(message, /E-mail:/);
  assert.doesNotMatch(message, /Imóvel:/);
});

test("buildAppointmentWhatsAppUrl — criar agendamento (contato): valid input + broker with WhatsApp produces a wa.me URL", () => {
  const result = buildAppointmentWhatsAppUrl(VALID_INPUT, {
    brokerWhatsapp: "(43) 99999-9999",
    listingUrl: "https://imobiliarista.net/imovel/apartamento-centro-123",
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.ok(result.url.startsWith("https://wa.me/5543999999999?text="));
  const decoded = decodeURIComponent(result.url.split("?text=")[1]);
  assert.match(decoded, /Tenho interesse em Apartamento no Centro/);
  assert.match(decoded, /Maria Souza/);
});

test("buildAppointmentWhatsAppUrl surfaces field errors without building a URL", () => {
  const result = buildAppointmentWhatsAppUrl(
    { ...VALID_INPUT, visitorName: "" },
    { brokerWhatsapp: "43999999999" },
  );
  assert.equal(result.valid, false);
  assert.equal(result.url, undefined);
  assert.ok(result.errors.visitorName);
});

test("buildAppointmentWhatsAppUrl reports a broker with no valid WhatsApp instead of building a broken link", () => {
  const result = buildAppointmentWhatsAppUrl(VALID_INPUT, { brokerWhatsapp: null });
  assert.equal(result.valid, false);
  assert.equal(result.url, undefined);
  assert.ok(result.errors.whatsapp);
});

// Isolamento multitenant reinterpretado para este módulo (ver README#decisões):
// como não há persistência em R2 (o registro é só o redirecionamento para o
// WhatsApp do corretor, nunca um armazenamento consultável), a garantia
// equivalente é que a URL de contato de um imóvel sempre resolve para o
// WhatsApp do corretor DAQUELE imóvel — nunca para o número de outro
// corretor processado na mesma sessão do browser.
test("buildAppointmentWhatsAppUrl never mixes up brokers across listings processed in the same session", () => {
  const listingA = { slug: "casa-a", brokerWhatsapp: "11911112222" };
  const listingB = { slug: "casa-b", brokerWhatsapp: "21922223333" };

  const resultA = buildAppointmentWhatsAppUrl(
    { ...VALID_INPUT, listingSlug: listingA.slug },
    { brokerWhatsapp: listingA.brokerWhatsapp },
  );
  const resultB = buildAppointmentWhatsAppUrl(
    { ...VALID_INPUT, listingSlug: listingB.slug },
    { brokerWhatsapp: listingB.brokerWhatsapp },
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
  assert.match(source, /export function buildDefaultAppointmentMessage/);
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
  });
  assert.equal(result.valid, true);
  assert.ok(result.url.startsWith("https://wa.me/5543999999999?text="));
});
