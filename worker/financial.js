// worker/financial.js
//
// Private /api/me/financial/* handlers (§51, §54 "financeiro" no painel,
// Etapa 10). Mesmo split que worker/api.js/worker/admin.js já usam:
// handler fino aqui (requireTenant, parse do body, mapeia erro para
// resposta), lógica de domínio — inclusive a chamada ao Asaas — em
// modules/financial/*.js. `POST /api/webhooks/asaas` NÃO está aqui: é
// pública, sem sessão, e o handler mora direto em
// modules/financial/webhook.js (mesmo caso de modules/saved-search/
// index.js) — worker/index.js reexporta os dois pontos de entrada.

import { requireTenant } from "./auth.js";
import { ForbiddenError } from "../core/permissions.js";
import { success, notFound, conflict, failure } from "../core/response.js";
import { ValidationError } from "../core/validation.js";
import { BrokerNotFoundError } from "../business/brokers.js";
import {
  createCheckoutForBroker,
  listChargesForBroker,
  getChargeForBroker,
  NothingToChargeError,
  FinancialModuleDisabledError,
} from "../modules/financial/index.js";

function requireOwnBrokerId(tenant) {
  if (!tenant) throw new ForbiddenError("Esta conta não possui um corretor associado.");
  return tenant.brokerId;
}

async function readJsonBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new ValidationError([{ field: "body", message: "JSON inválido." }]);
  }
}

/** Mapeia os erros de domínio deste módulo para uma resposta — `null` se `error` não for um deles, para o handler relançar e cair no 500 genérico de core/app.js. */
function mapFinancialError(error) {
  if (error instanceof FinancialModuleDisabledError) {
    return failure("module_disabled", error.message, { status: 503 });
  }
  if (error instanceof NothingToChargeError) {
    return conflict(error.message);
  }
  if (error instanceof BrokerNotFoundError) {
    return notFound(error.message);
  }
  return null;
}

// --- POST /api/me/financial/checkout ------------------------------------
export async function handleCreateCheckout(request, env) {
  const { tenant } = await requireTenant(request, env);
  const brokerId = requireOwnBrokerId(tenant);

  const body = await readJsonBody(request);
  try {
    const charge = await createCheckoutForBroker(env, brokerId, body?.kind);
    return success(charge, { status: 201 });
  } catch (error) {
    const mapped = mapFinancialError(error);
    if (mapped) return mapped;
    throw error;
  }
}

// --- GET /api/me/financial/charges ---------------------------------------
export async function handleListMyCharges(request, env) {
  const { tenant } = await requireTenant(request, env);
  const brokerId = requireOwnBrokerId(tenant);
  const charges = await listChargesForBroker(env, brokerId);
  return success(charges);
}

// --- GET /api/me/financial/charges/:id ------------------------------------
export async function handleGetMyCharge(request, env, ctx, params) {
  const { tenant } = await requireTenant(request, env);
  const brokerId = requireOwnBrokerId(tenant);
  const charge = await getChargeForBroker(env, brokerId, params.id);
  if (!charge) return notFound("Cobrança não encontrada.");
  return success(charge);
}
