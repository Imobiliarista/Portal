// modules/feeds/index.js
//
// Módulo feeds (§46) — "Modo Exportação", ponto de entrada. §46 só
// esboça a árvore de arquivos (index.js, registry.js, formatters/,
// generator.js, README.md) e diz "Exports ficam no R2" — o resto (opt-in
// por submódulo, um arquivo por submódulo agregando todos os corretores
// que o habilitaram, formato exato do XML) é decisão de produto
// confirmada nesta etapa, documentada em modules/feeds/README.md.
//
// `broker.modules.feeds` é um objeto por submódulo
// (`{ vrsync: { enabled } }`) — schemas/broker.schema.json#modules já é
// `additionalProperties: true` ("shape owned by each module, not by
// core"), nenhuma mudança de schema necessária. Os helpers de
// leitura/validação (`readFeedSubmoduleConfig`/`validateFeedSubmoduleConfig`)
// vivem em modules/feeds/config.js — ver o header desse arquivo pro
// porquê de estarem separados (circular import, não a razão de bundle de
// browser que fez modules/publications separar o dela).
//
// Diferente de todos os módulos anteriores desta etapa, este alcança o
// browser em DUAS frentes: `modules/feeds/generator.js` roda 100%
// server-side (o robô de um portal externo consome o arquivo estático
// resultante, nunca executa JS), mas o painel (frontend/painel/) precisa
// listar os submódulos disponíveis e deixar o corretor ligar/desligar
// cada um — por isso `renderFrontendModuleSource` abaixo, mesmo padrão
// `.toString()` de modules/publications/index.js, gerando
// frontend/shared/feeds.generated.js via scripts/generate-feeds-assets.js
// (`npm run generate:feeds`). O bundle gerado leva só metadados
// (`{id, displayName}` de cada submódulo) + `readFeedSubmoduleConfig` —
// nunca a função `generate` de um formatter (lógica de montagem de XML,
// sem razão nenhuma pra alcançar o browser).

import { FEEDS_MODULE_KEY, readFeedSubmoduleConfig } from "./config.js";
import { FEED_SUBMODULES } from "./registry.js";

export { FEEDS_MODULE_KEY, DEFAULT_FEED_SUBMODULE_CONFIG, readFeedSubmoduleConfig, validateFeedSubmoduleConfig, hasAnyFeedSubmoduleEnabled } from "./config.js";
export { FEED_SUBMODULES, FEED_SUBMODULE_IDS } from "./registry.js";
export { regenerateFeeds, collectFeedItems, buildFeedHeader, UnknownFeedSubmoduleError } from "./generator.js";

/**
 * Gera o texto completo (standalone ESM, sem imports) de
 * frontend/shared/feeds.generated.js — chamado só por
 * scripts/generate-feeds-assets.js, nunca em runtime. `FEED_SUBMODULES_PUBLIC`
 * é dado estático (`{id, displayName}[]`, derivado do registry só na hora
 * de gerar o arquivo — o registry inteiro, com as funções `generate`,
 * nunca é serializado); `readFeedSubmoduleConfig` é embutido via
 * `.toString()` (testado aqui em Node, é literalmente o que roda no
 * browser — mesmo padrão de modules/publications/index.js).
 */
export function renderFrontendModuleSource() {
  const submodulesPublic = Object.values(FEED_SUBMODULES).map(({ id, displayName }) => ({ id, displayName }));

  return `// frontend/shared/feeds.generated.js
//
// GERADO por scripts/generate-feeds-assets.js a partir de
// modules/feeds/registry.js + modules/feeds/config.js — não editar à mão
// (§46, módulo feeds, "Modo Exportação"). Regenerar com:
// npm run generate:feeds

export const FEED_SUBMODULES_PUBLIC = ${JSON.stringify(submodulesPublic, null, 2)};

const FEEDS_MODULE_KEY = ${JSON.stringify(FEEDS_MODULE_KEY)};
const DEFAULT_FEED_SUBMODULE_CONFIG = Object.freeze({ enabled: false });

export ${readFeedSubmoduleConfig.toString()}
`;
}
