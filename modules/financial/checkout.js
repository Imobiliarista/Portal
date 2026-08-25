// modules/financial/checkout.js
//
// Cria (ou reaproveita) o checkout de uma cobrança para um corretor: taxa
// de implantação ("setup") ou mensalidade ("monthly") do plano atual dele
// (§51, Etapa 10) — `business/plans.js#getPlanForBroker` é o mesmo
// resolver que já embasa o limite de galeria/anúncios ativos, e
// `monthlyPrice`/`setupPrice` existem no registro de plano desde a Etapa
// 10/§52, mas nada os lia até este lote (business/plans.js header,
// pendência 22 do CHANGELOG). "Transações continuam no Worker" (§51) —
// função de negócio pura (`env`, `brokerId`, ...), nenhuma Request/
// Response aqui: o handler HTTP fino (requireTenant + parse do body) mora
// em worker/financial.js, mesmo split que worker/api.js já usa para
// business/listings.js. Todo módulo anterior desta etapa segue a mesma
// convenção — worker/ chama modules/, nunca o contrário — então esta
// função nunca importa nada de worker/.
//
// Gate de duas camadas antes de qualquer I/O: `assertFinancialModuleEnabled`
// primeiro (nem lê o plano do corretor com o módulo desligado), e
// provider.js barraria de qualquer forma antes do fetch — ver header de
// provider.js.

import { assertFinancialModuleEnabled, createCustomer, createPayment } from "./provider.js";
import { getPrivate, putPrivate } from "../../storage/private.js";
import { privateKeys } from "../../storage/keys.js";
import { addFinancialChargeToBrokerIndex } from "../../storage/indexes.js";
import { getBrokerById, BrokerNotFoundError } from "../../business/brokers.js";
import { getPlanForBroker } from "../../business/plans.js";
import { isEnum, ValidationError } from "../../core/validation.js";

const CHARGE_KINDS = ["setup", "monthly"];

export class NothingToChargeError extends Error {
  constructor(kind) {
    super(`O plano deste corretor não tem valor de "${kind}" configurado (0 ou ausente) — nada a cobrar.`);
    this.name = "NothingToChargeError";
  }
}

function now() {
  return new Date().toISOString();
}

/** "YYYY-MM-DD" de amanhã (UTC) — o Asaas exige um dueDate presente/futuro; amanhã evita qualquer ambiguidade de fuso-horário no limite exato de "hoje". */
function tomorrowDateStamp() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Resolve o `providerCustomerId` do Asaas para este corretor, criando um
 * cliente novo só na primeira vez (evita duplicar cliente no Asaas a cada
 * checkout — o Asaas em si permite duplicados, ver provider.js).
 */
async function resolveProviderCustomerId(env, broker) {
  const key = privateKeys.financialCustomer(broker.brokerId);
  const existing = await getPrivate(env, key);
  if (existing?.providerCustomerId) return existing.providerCustomerId;

  if (!broker.cpf) {
    throw new ValidationError([
      { field: "cpf", message: "corretor precisa ter CPF cadastrado antes de gerar uma cobrança." },
    ]);
  }

  const customer = await createCustomer(env, {
    name: broker.name,
    email: broker.email,
    cpfCnpj: broker.cpf,
    externalReference: broker.brokerId,
  });
  await putPrivate(env, key, {
    brokerId: broker.brokerId,
    providerCustomerId: customer.id,
    createdAt: now(),
  });
  return customer.id;
}

/**
 * Cria uma cobrança de checkout para `brokerId`. `kind` é "setup" (taxa de
 * implantação, `plan.setupPrice`) ou "monthly" (mensalidade,
 * `plan.monthlyPrice`). Um plano com valor 0/ausente para o `kind` pedido
 * lança `NothingToChargeError` antes de tocar o Asaas — nunca cria uma
 * cobrança de R$0.
 */
export async function createCheckoutForBroker(env, brokerId, kind) {
  assertFinancialModuleEnabled(env);
  if (!isEnum(kind, CHARGE_KINDS)) {
    throw new ValidationError([{ field: "kind", message: `deve ser um de: ${CHARGE_KINDS.join(", ")}` }]);
  }

  const broker = await getBrokerById(env, brokerId);
  if (!broker) throw new BrokerNotFoundError(brokerId);

  const plan = await getPlanForBroker(env, brokerId);
  const amount = kind === "setup" ? plan.setupPrice : plan.monthlyPrice;
  if (!amount || amount <= 0) throw new NothingToChargeError(kind);

  const providerCustomerId = await resolveProviderCustomerId(env, broker);

  const chargeId = `charge_${crypto.randomUUID()}`;
  const payment = await createPayment(env, {
    customer: providerCustomerId,
    value: amount,
    dueDate: tomorrowDateStamp(),
    description:
      kind === "setup" ? `Taxa de implantação — plano ${plan.name}` : `Mensalidade — plano ${plan.name}`,
    externalReference: chargeId,
  });

  const charge = {
    schemaVersion: 1,
    chargeId,
    brokerId,
    planId: plan.planId,
    kind,
    amount,
    status: "pending",
    provider: "asaas",
    providerCustomerId,
    providerPaymentId: payment.id,
    invoiceUrl: payment.invoiceUrl ?? null,
    billingType: payment.billingType ?? "UNDEFINED",
    createdAt: now(),
    updatedAt: now(),
    confirmedAt: null,
  };
  await putPrivate(env, privateKeys.financialCharge(chargeId), charge);
  await addFinancialChargeToBrokerIndex(env, brokerId, chargeId);

  return charge;
}
