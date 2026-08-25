// modules/plans/features.js
//
// Módulo plans (§52), Etapa 10. Metadados de exibição para os toggles de
// módulo que um plano pode conceder. business/plans.js#PLAN_MODULE_KEYS é
// a lista canônica de chaves válidas (validação de schema mora lá — §39
// proíbe business/ de depender de modules/); este arquivo só anexa um
// rótulo legível para cada chave, para quem (eligibility.js, e no futuro
// um SuperAdmin que queira descrever — não só checar — uma feature).
//
// frontend/admin/ não importa este arquivo: como todo módulo em
// modules/, ele fica fora de frontend/ (Workers Static Assets só publica
// frontend/, wrangler.toml) e não tem gerador de bundle neste lote — o
// formulário de planos no SuperAdmin usa rótulos próprios, hardcoded, o
// mesmo padrão que frontend/painel usa para os checkboxes de
// publications/feeds.

import { PLAN_MODULE_KEYS } from "../../business/plans.js";

const FEATURE_LABELS = {
  publications: "Publicações (feed Blogger)",
  feeds: "Feeds para portais externos (OLX/ZAP/VivaReal)",
};

/** `[{key, label}]`, sempre em sincronia com PLAN_MODULE_KEYS — nunca duplicar a lista de chaves aqui. */
export const PLAN_FEATURES = PLAN_MODULE_KEYS.map((key) => ({
  key,
  label: FEATURE_LABELS[key] ?? key,
}));
