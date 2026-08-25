// modules/plans/index.js
//
// Módulo plans (§52), Etapa 10 — ponto de entrada. §52 só esboça a árvore
// de arquivos (index.js, catalog.js, eligibility.js, features.js,
// README.md); o schema/CRUD real do plano mora em business/plans.js
// (Etapa 8b, ampliado nesta etapa) — este módulo é só a camada de
// consulta que outros módulos usariam em vez de reimportar
// business/plans.js diretamente (ver catalog.js e eligibility.js).
//
// Nada aqui é consumido por nenhum outro módulo ainda — ver
// eligibility.js para o porquê (conectar modules/publications/modules/feeds
// é decisão pendente, não assumida neste lote). worker/admin.js também
// não importa daqui: o CRUD de plano do SuperAdmin (§53) segue chamando
// business/plans.js direto, como desde a Etapa 8b — esse caminho não foi
// tocado.

export { listPlans, getPlanById, getPlanForBroker, DEFAULT_PLAN_ID, PLAN_MODULE_KEYS } from "./catalog.js";
export { isModuleEnabledForBroker, getEnabledModulesForBroker } from "./eligibility.js";
export { PLAN_FEATURES } from "./features.js";
