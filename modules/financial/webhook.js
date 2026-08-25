// modules/financial/webhook.js
//
// Recebe eventos do Asaas (§51, Etapa 10) — `POST /api/webhooks/asaas`,
// rota pública (o Asaas não manda cookie de sessão nenhum): autenticada
// pelo header `asaas-access-token`, que precisa bater com
// `env.ASAAS_WEBHOOK_TOKEN` (secret próprio, nunca ASAAS_API_KEY — mesmo
// raciocínio de secrets separados por job que já justifica
// PASSWORD_PEPPER vs. LOGIN_INDEX_SECRET, ver worker/auth.js).
//
// Handler HTTP definido AQUI, não em worker/financial.js: diferente de
// checkout.js/payments.js (que exigem sessão de corretor, então o handler
// fino mora em worker/), esta rota não usa requireTenant/sessão nenhuma —
// mesmo caso de modules/saved-search/index.js (rota pública, handler
// direto no módulo, reexportado por worker/index.js sem intermediário).
//
// Gate: como todo o resto do módulo, recusa processar qualquer evento
// enquanto `FINANCIAL_ENABLED != "true"`. Na prática nenhum webhook chega
// a ser cadastrado no Asaas enquanto ASAAS_API_KEY não existir (ver
// README.md#pendências) — mas o gate garante que um webhook cadastrado
// manualmente no painel do Asaas e esquecido lá não consegue mudar estado
// local só porque bateu nesta URL (§51 "nenhum endpoint... deve sequer
// chamar o Asaas" é sobre saída; isto é entrada — mesmo espírito de
// "módulo desligado não faz nada").
//
// Idempotência: cada evento do Asaas carrega um `id` próprio (`evt_...`),
// distinto do id do pagamento — gravado em `financial/webhook-events/`
// antes de processar, então uma reentrega do mesmo evento (o Asaas
// reenvia em caso de timeout/erro do lado do receptor) nunca aplica a
// mesma transição de status duas vezes.

import { getPrivate, putPrivate } from "../../storage/private.js";
import { privateKeys } from "../../storage/keys.js";
import { isFinancialModuleEnabled } from "./provider.js";
import { mapAsaasStatus } from "./payments.js";
import { success, failure } from "../../core/response.js";
import { createLogger } from "../../core/logger.js";

const logger = createLogger("modules.financial.webhook");

// Eventos que marcam a cobrança como paga pela primeira vez (§51 — só
// esses dois setam `confirmedAt`; os demais eventos do Asaas só atualizam
// `status` via mapAsaasStatus).
const CONFIRMED_LIKE_EVENTS = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"];

/**
 * `POST /api/webhooks/asaas`. Sempre responde 2xx para um token válido já
 * processado, mesmo se `payment.externalReference` não bater com nenhuma
 * cobrança local — loga e ignora (`matched: false`), nunca faz o Asaas
 * re-tentar por um evento que não é um erro nosso.
 */
export async function handleAsaasWebhook(request, env) {
  if (!isFinancialModuleEnabled(env)) {
    return failure("module_disabled", "Módulo financial está desativado.", { status: 503 });
  }

  const expectedToken = env?.ASAAS_WEBHOOK_TOKEN;
  if (!expectedToken) {
    logger.error("webhook_token_not_configured");
    return failure("not_configured", "Webhook não configurado.", { status: 503 });
  }
  const receivedToken = request.headers.get("asaas-access-token");
  if (receivedToken !== expectedToken) {
    return failure("unauthorized", "Token inválido.", { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return failure("bad_request", "JSON inválido.", { status: 400 });
  }

  const eventId = body?.id;
  const eventType = body?.event;
  const payment = body?.payment;
  if (!eventId || !eventType || !payment?.id) {
    return failure("bad_request", "Payload de webhook incompleto.", { status: 400 });
  }

  const eventKey = privateKeys.financialWebhookEvent(eventId);
  const alreadyProcessed = await getPrivate(env, eventKey);
  if (alreadyProcessed) {
    return success({ deduped: true });
  }
  await putPrivate(env, eventKey, { eventId, eventType, receivedAt: new Date().toISOString() });

  const chargeId = payment.externalReference;
  const charge = chargeId ? await getPrivate(env, privateKeys.financialCharge(chargeId)) : null;
  if (!charge) {
    logger.error("webhook_charge_not_found", { eventId, eventType, chargeId, providerPaymentId: payment.id });
    return success({ matched: false });
  }

  const status = mapAsaasStatus(payment.status);
  const updatedAt = new Date().toISOString();
  const updated = {
    ...charge,
    status,
    updatedAt,
    ...(CONFIRMED_LIKE_EVENTS.includes(eventType) && !charge.confirmedAt ? { confirmedAt: updatedAt } : {}),
  };
  await putPrivate(env, privateKeys.financialCharge(chargeId), updated);

  return success({ matched: true, chargeId, status });
}
