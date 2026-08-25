// modules/financial/provider.js
//
// Cliente HTTP para a API do Asaas (§51, Etapa 10) — sandbox. Único
// arquivo deste módulo que efetivamente monta uma URL do Asaas e chama
// `fetch`; checkout.js/payments.js/webhook.js nunca tocam SANDBOX_BASE_URL
// diretamente, mesmo espírito de storage/private.js ser o único lugar que
// toca `env.IMOB_PRIVATE` (§69 "não espalhar").
//
// Kill switch (decisão deste lote — §51 pede o módulo "completo, mas
// DESATIVADO por flag", e o pedido foi reaproveitar o mecanismo que o
// projeto já usa, não inventar um novo): `env.FINANCIAL_ENABLED` precisa
// ser exatamente a string "true" pra qualquer função aqui sequer montar
// uma Request. Mesmo mecanismo de env var/secret já usado no projeto para
// gating de integração externa (RESEND_API_KEY, SESSION_SECRET,
// PASSWORD_PEPPER, LOGIN_INDEX_SECRET, SAVED_SEARCH_TOKEN_SECRET — todos
// lidos de `env` em runtime, nunca hardcoded), só que como var não-secreta
// (`[vars]` em wrangler.toml, reservado mas nunca usado até este lote) em
// vez de secret, porque não é sensível — é só um booleano. Trocar o valor
// via `wrangler secret put`/dashboard do Cloudflare ("Settings > Variables
// and Secrets") NÃO exige rodar `wrangler deploy`/redeploy de código — só
// uma nova versão do binding, exatamente o "liga/desliga sem redeploy"
// pedido. Ressalva documentada em modules/financial/README.md#decisões: um
// `wrangler deploy` de rotina reaplica o valor do wrangler.toml (default
// "false"), então uma ativação feita só pelo dashboard não sobrevive ao
// próximo deploy de código — comportamento intencional (fail-safe), não
// um bug.
//
// `assertFinancialModuleEnabled` roda ANTES de qualquer `fetch` em
// `asaasFetch` — um valor ausente/errado (default deste lote: "false")
// garante zero tráfego de rede para o Asaas, mesmo que
// checkout.js/payments.js/webhook.js tenham algum bug e esqueçam de checar
// por conta própria (eles também checam — defesa em profundidade, não o
// único gate).
//
// Endpoints/campos/headers confirmados contra a documentação oficial
// (docs.asaas.com) nesta sessão via WebSearch — a rede desta sessão não
// permite bater direto na sandbox, e não há ASAAS_API_KEY provisionada
// (ver README.md#pendências), então NADA aqui foi de fato exercitado
// contra a API real. Reconferir contra a doc oficial antes de ativar em
// produção: base sandbox `https://sandbox.asaas.com/api/v3` (produção é
// `https://api.asaas.com/v3`, não usado neste lote), autenticação via
// header `access_token` (Asaas não usa `Authorization: Bearer`), webhook
// autenticado pelo header `asaas-access-token` (ver webhook.js).

const SANDBOX_BASE_URL = "https://sandbox.asaas.com/api/v3";

export class FinancialModuleDisabledError extends Error {
  constructor() {
    super('Módulo financial está desativado (env.FINANCIAL_ENABLED != "true").');
    this.name = "FinancialModuleDisabledError";
  }
}

export class AsaasApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "AsaasApiError";
    this.status = status;
    this.body = body;
  }
}

/** `true` só quando `env.FINANCIAL_ENABLED` é literalmente a string "true" — qualquer outro valor (ausente, "false", "1", `true` booleano vindo de um binding mal configurado, etc.) mantém o módulo desligado. Default seguro: §51 pede o módulo "DESATIVADO por flag". */
export function isFinancialModuleEnabled(env) {
  return env?.FINANCIAL_ENABLED === "true";
}

/** Lança `FinancialModuleDisabledError` a menos que o módulo esteja ligado. Chamado no topo de toda função deste arquivo, e também no topo de checkout.js/payments.js (antes de qualquer leitura/escrita em R2) e no topo do handler de webhook.js — nunca faz trabalho "por nada" enquanto o módulo está desligado. */
export function assertFinancialModuleEnabled(env) {
  if (!isFinancialModuleEnabled(env)) {
    throw new FinancialModuleDisabledError();
  }
}

function apiKey(env) {
  if (!env?.ASAAS_API_KEY) {
    throw new Error("modules/financial: binding ASAAS_API_KEY ausente em env.");
  }
  return env.ASAAS_API_KEY;
}

async function asaasFetch(env, path, { method = "GET", body } = {}) {
  assertFinancialModuleEnabled(env);

  const response = await fetch(`${SANDBOX_BASE_URL}${path}`, {
    method,
    headers: {
      access_token: apiKey(env),
      "Content-Type": "application/json",
      "User-Agent": "imobiliarista.net",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AsaasApiError(`Asaas respondeu ${response.status} em ${method} ${path}`, {
      status: response.status,
      body: responseBody,
    });
  }
  return responseBody;
}

/**
 * Cria um cliente no Asaas (POST /customers). O Asaas permite clientes
 * duplicados — cabe a quem chama (checkout.js) decidir se reaproveita um
 * `providerCustomerId` já salvo antes de chamar isto de novo.
 */
export async function createCustomer(env, { name, email, cpfCnpj, externalReference }) {
  return asaasFetch(env, "/customers", {
    method: "POST",
    body: { name, email, cpfCnpj, externalReference },
  });
}

/**
 * Cria uma cobrança (POST /payments). `billingType: "UNDEFINED"` deixa o
 * Asaas oferecer todas as formas de pagamento na fatura — decisão de
 * produto deste lote (sem seletor de forma de pagamento no checkout, ver
 * README.md#decisões).
 */
export async function createPayment(
  env,
  { customer, value, dueDate, description, externalReference, billingType = "UNDEFINED" },
) {
  return asaasFetch(env, "/payments", {
    method: "POST",
    body: { customer, billingType, value, dueDate, description, externalReference },
  });
}

/** GET /payments/{id} — usado por payments.js#syncChargeStatus para sincronizar o status local com o que o Asaas tem. */
export async function getPayment(env, providerPaymentId) {
  return asaasFetch(env, `/payments/${encodeURIComponent(providerPaymentId)}`);
}
