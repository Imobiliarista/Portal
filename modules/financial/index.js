// modules/financial/index.js
//
// Ponto de entrada do módulo financial (§51, Etapa 10, integração Asaas
// sandbox). Reexporta o que worker/financial.js e worker/index.js
// precisam — mesmo padrão de modules/feeds/index.js e
// modules/saved-search/index.js.
//
// DESATIVADO por flag (pedido explícito deste lote): `env.FINANCIAL_ENABLED`
// precisa ser exatamente a string "true" (ver modules/financial/provider.js)
// para qualquer chamada real ao Asaas acontecer. `README.md#decisões`
// detalha o mecanismo (reaproveita o padrão de env var/secret já usado no
// projeto) e como ligar/desligar sem redeploy.

export {
  isFinancialModuleEnabled,
  assertFinancialModuleEnabled,
  FinancialModuleDisabledError,
  AsaasApiError,
} from "./provider.js";
export { createCheckoutForBroker, NothingToChargeError } from "./checkout.js";
export {
  listChargesForBroker,
  getChargeForBroker,
  syncChargeStatus,
  mapAsaasStatus,
  ChargeNotFoundError,
} from "./payments.js";
export { handleAsaasWebhook } from "./webhook.js";
