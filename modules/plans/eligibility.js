// modules/plans/eligibility.js
//
// Módulo plans (§52), Etapa 10. Centraliza "esse corretor tem módulo X no
// plano dele?" — a pergunta que §52 pede para não ficar espalhada pela
// base. `getPlanForBroker` (business/plans.js, Etapa 8b + Etapa 10) já
// resolve o plano de um corretor com o mesmo fallback que
// getGalleryLimitForBroker usa (plano atribuído → plano padrão "free"
// quando ausente/inexistente); as funções abaixo só leem `plan.modules`
// depois disso.
//
// IMPORTANTE — nada neste lote CHAMA estas funções. modules/publications
// e modules/feeds continuam exatamente como estavam: sem nenhum check de
// plano, ambos utilizáveis por qualquer corretor independente do que o
// plano dele diz em `modules`. Conectar essas duas funções em qualquer
// um dos dois módulos é uma decisão de produto explicitamente adiada —
// pedido do solicitante para este lote — porque mudaria o comportamento
// de um módulo já em produção sem confirmação prévia. Ver
// modules/plans/README.md e o PR deste lote para o pendência.

import { getPlanForBroker, PLAN_MODULE_KEYS } from "../../business/plans.js";

/**
 * `true` se o plano atualmente atribuído a `brokerId` concede o módulo
 * `moduleKey` (uma das chaves de business/plans.js#PLAN_MODULE_KEYS).
 * Uma chave desconhecida sempre resolve `false` — nunca lança — mesmo
 * espírito defensivo de outros checks deste projeto (§49 "se inexistente,
 * componente não renderiza").
 */
export async function isModuleEnabledForBroker(env, brokerId, moduleKey) {
  if (!PLAN_MODULE_KEYS.includes(moduleKey)) return false;
  const plan = await getPlanForBroker(env, brokerId);
  return plan.modules?.[moduleKey] === true;
}

/** Lista as chaves de módulo que o plano atual de `brokerId` concede (subconjunto de PLAN_MODULE_KEYS). */
export async function getEnabledModulesForBroker(env, brokerId) {
  const plan = await getPlanForBroker(env, brokerId);
  return PLAN_MODULE_KEYS.filter((key) => plan.modules?.[key] === true);
}
