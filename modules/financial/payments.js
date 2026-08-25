// modules/financial/payments.js
//
// Leitura/consulta de cobranças (§51, Etapa 10). O caminho comum (listar/
// consultar uma cobrança) nunca toca o Asaas: o status gravado em R2 —
// escrito por checkout.js na criação e por webhook.js a cada evento — é a
// fonte de verdade que o painel do corretor lê. `syncChargeStatus` abaixo
// é a única função deste arquivo que chama o provider (GET /payments/{id})
// e existe só como refresh manual best-effort (ex. para um corretor cujo
// webhook não chegou); nenhum caminho automático deste lote a chama.

import { getPrivate, putPrivate } from "../../storage/private.js";
import { privateKeys } from "../../storage/keys.js";
import { getFinancialChargeIdsForBroker } from "../../storage/indexes.js";
import { assertFinancialModuleEnabled, getPayment } from "./provider.js";

export class ChargeNotFoundError extends Error {
  constructor(chargeId) {
    super(`Cobrança "${chargeId}" não encontrada.`);
    this.name = "ChargeNotFoundError";
  }
}

/** Lista as cobranças de `brokerId`, mais recentes primeiro. Não chama o Asaas — lê só o que já está gravado em R2 (ver header). */
export async function listChargesForBroker(env, brokerId) {
  const chargeIds = await getFinancialChargeIdsForBroker(env, brokerId);
  const charges = [];
  for (const chargeId of chargeIds) {
    const charge = await getPrivate(env, privateKeys.financialCharge(chargeId));
    if (charge) charges.push(charge); // defensivo — registro órfão não derruba a listagem, mesmo padrão de business/plans.js#listPlans
  }
  charges.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return charges;
}

/** Busca uma cobrança específica, garantindo que pertence a `brokerId` (§55 — nunca resolvida só pelo id vindo da URL). Retorna `null` se não existir ou pertencer a outro corretor. */
export async function getChargeForBroker(env, brokerId, chargeId) {
  const charge = await getPrivate(env, privateKeys.financialCharge(chargeId));
  if (!charge || charge.brokerId !== brokerId) return null;
  return charge;
}

/**
 * Mapeia o `status` do Asaas para o vocabulário interno de uma cobrança.
 * Compartilhado com webhook.js, para os dois caminhos (refresh manual e
 * evento de webhook) nunca divergirem em como um mesmo status do Asaas é
 * traduzido.
 */
export function mapAsaasStatus(asaasStatus) {
  switch (asaasStatus) {
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
    case "CONFIRMED":
      return "confirmed";
    case "OVERDUE":
      return "overdue";
    case "REFUNDED":
    case "REFUND_REQUESTED":
      return "refunded";
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
      return "chargeback";
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
      return "pending";
    default:
      return "pending";
  }
}

/** Sincroniza o status local de uma cobrança com o Asaas. Refresh manual best-effort — não chamada em nenhum caminho automático deste lote (ver header). */
export async function syncChargeStatus(env, chargeId) {
  assertFinancialModuleEnabled(env);
  const charge = await getPrivate(env, privateKeys.financialCharge(chargeId));
  if (!charge) throw new ChargeNotFoundError(chargeId);

  const payment = await getPayment(env, charge.providerPaymentId);
  const updated = { ...charge, status: mapAsaasStatus(payment.status), updatedAt: new Date().toISOString() };
  await putPrivate(env, privateKeys.financialCharge(chargeId), updated);
  return updated;
}
