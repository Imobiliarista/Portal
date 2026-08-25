// modules/plans/catalog.js
//
// Módulo plans (§52), Etapa 10. Reexport fino do acesso de leitura ao
// catálogo de planos que já mora em business/plans.js (Etapa 8b) — outros
// módulos (uma vez que consultar plano vire uma coisa que módulos fazem,
// ver eligibility.js) importam daqui, não de business/plans.js
// diretamente. Nenhum comportamento novo, nenhuma duplicação: só o limite
// de pacote (§52 "não espalhar checks de plano pela base" aplicado à
// própria leitura do catálogo, não só aos checks booleanos).

export { listPlans, getPlanById, getPlanForBroker, DEFAULT_PLAN_ID, PLAN_MODULE_KEYS } from "../../business/plans.js";
