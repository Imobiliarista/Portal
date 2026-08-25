// modules/feeds/config.js
//
// Módulo feeds (§46) — "Modo Exportação": forma, leitura e validação de
// `broker.modules.feeds`. Deixou de ser um booleano único
// (`{enabled}`, lote anterior) e virou um objeto por submódulo —
// `{ vrsync: { enabled: true/false }, ... }` — mesmo padrão de
// `broker.modules.publications`, mas com uma chave a mais de nível
// (submódulo) para as próximas entradas do registry
// (modules/feeds/registry.js) crescerem ao lado de `vrsync` sem precisar
// mudar o formato do objeto inteiro outra vez.
//
// Split out of index.js (§67 não lista um config.js para este módulo,
// diferente de modules/publications) puramente para evitar import
// circular: modules/feeds/generator.js precisa de
// `readFeedSubmoduleConfig` também, e modules/feeds/index.js reexporta
// generator.js — manter isto em index.js faria
// index.js -> generator.js -> index.js. Nenhuma restrição de bundle de
// browser se aplica aqui do jeito que se aplicava a
// modules/publications/config.js — mas frontend/painel também usa este
// arquivo (via scripts/generate-feeds-assets.js embutindo
// `readFeedSubmoduleConfig`, mesmo padrão de outros módulos desta etapa).

export const FEEDS_MODULE_KEY = "feeds";

/** Estado default para um corretor que nunca configurou um dado submódulo. */
export const DEFAULT_FEED_SUBMODULE_CONFIG = Object.freeze({ enabled: false });

/**
 * Lê `broker.modules.feeds[submoduleId]` (o draft privado — é o único
 * lugar de onde isto é lido; business/publishing.js#normalizeBrokerForPublic
 * também repassa `modules` inteiro pra projeção pública, mas nada
 * público-facing precisa reler esta chave especificamente) com um
 * default seguro. Nunca lança: entrada ausente/malformada vira
 * `DEFAULT_FEED_SUBMODULE_CONFIG`.
 */
export function readFeedSubmoduleConfig(broker, submoduleId) {
  const raw = broker?.modules?.[FEEDS_MODULE_KEY]?.[submoduleId];
  if (!raw || typeof raw !== "object") return DEFAULT_FEED_SUBMODULE_CONFIG;
  return { enabled: raw.enabled === true };
}

/**
 * Valida `{enabled}` de UM submódulo antes de entrar no patch de
 * `PUT /api/me/profile` (§72, `modules: {feeds: {[submoduleId]: ...}}`).
 * Retorna `{valid: true, config}` ou `{valid: false, error}` — nunca
 * lança; quem chama decide como exibir o erro.
 */
export function validateFeedSubmoduleConfig({ enabled } = {}) {
  if (typeof enabled !== "boolean") {
    return { valid: false, error: "enabled precisa ser true ou false." };
  }
  return { valid: true, config: { enabled } };
}

/**
 * True se o corretor tem QUALQUER submódulo registrado habilitado —
 * usado por worker/api.js e worker/admin.js pra decidir se vale a pena
 * pagar o custo de uma regeneração completa do feed numa escrita que, do
 * contrário, não teria nada a ver com exportação. `submoduleIds` é
 * passado pelo chamador (tipicamente `FEED_SUBMODULE_IDS`,
 * modules/feeds/registry.js) em vez deste arquivo importar o registry
 * diretamente — mantém este arquivo sem essa dependência extra.
 */
export function hasAnyFeedSubmoduleEnabled(broker, submoduleIds) {
  return submoduleIds.some((submoduleId) => readFeedSubmoduleConfig(broker, submoduleId).enabled);
}
