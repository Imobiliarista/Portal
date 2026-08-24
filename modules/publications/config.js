// modules/publications/config.js
//
// Módulo publications (§47) — forma, leitura e validação do bloco
// `broker.modules.publications` ({enabled, feedUrl}), o "config no
// perfil público do corretor" que §47 define. Puro, sem imports: este
// arquivo roda tanto em Node (testes) quanto embutido no bundle gerado
// que painel e minisite consomem no Browser (ver
// modules/publications/index.js#renderFrontendModuleSource) — por isso
// não depende de core/validation.js, que arrastaria a classe
// ValidationError inteira pro bundle gerado só para validar dois campos.
//
// Nada aqui grava em R2: quem persiste é sempre
// business/brokers.js#updateBrokerProfile, através do campo genérico e
// opaco `modules` (schemas/broker.schema.json#modules,
// "additionalProperties: true" — "shape owned by each module, not by
// core"). O Worker não conhece nem valida o formato deste bloco — a
// validação abaixo é só a mesma "UX nicety" que
// frontend/painel/forms.js já documenta para os demais campos do
// formulário: a fonte de verdade real é o que o corretor efetivamente
// configurou, não uma checagem de schema no backend.

export const PUBLICATIONS_MODULE_KEY = "publications";

/** Estado default para um corretor que nunca configurou o módulo. */
export const DEFAULT_PUBLICATIONS_CONFIG = Object.freeze({ enabled: false, feedUrl: null });

/** Só http(s) — mesmo crivo de core/validation.js#isUrl, reimplementado aqui para manter este arquivo sem imports (ver header). */
export function isHttpUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Lê `broker.modules.publications` (tanto do draft privado quanto da
 * projeção pública — mesmo formato nos dois, §47) com defaults seguros.
 * Nunca lança: entrada ausente/malformada vira
 * DEFAULT_PUBLICATIONS_CONFIG. `enabled` só é reportado `true` quando
 * há também um `feedUrl` válido — um corretor não pode ter o
 * componente "ligado" sem um feed resolvido para consumir (§47:
 * "se inexistente, componente não renderiza", mesmo espírito de
 * tour-360/video-youtube).
 */
export function readPublicationsConfig(broker) {
  const raw = broker?.modules?.[PUBLICATIONS_MODULE_KEY];
  if (!raw || typeof raw !== "object") return DEFAULT_PUBLICATIONS_CONFIG;
  const feedUrl = isHttpUrl(raw.feedUrl) ? raw.feedUrl : null;
  return { enabled: raw.enabled === true && feedUrl !== null, feedUrl };
}

/**
 * Valida `{enabled, feedUrl}` antes de entrar no patch de
 * `PUT /api/me/profile` (§72, `modules: {publications: ...}`). Retorna
 * `{valid: true, config}` ou `{valid: false, error}` — nunca lança; quem
 * chama decide como exibir o erro (ver frontend/painel/app.js).
 *
 * `feedUrl` precisa já vir resolvido: a decisão deste lote é que o
 * corretor cola o link do blog (Blogger/Blogspot) e
 * `resolveBloggerFeedUrl` (modules/publications/index.js) descobre o
 * feed Atom UMA VEZ, no painel — nunca uma URL de blog crua persistida
 * como se fosse o feed. Por isso `enabled: true` sem `feedUrl` é sempre
 * inválido.
 */
export function validatePublicationsConfig({ enabled, feedUrl } = {}) {
  if (typeof enabled !== "boolean") {
    return { valid: false, error: "enabled precisa ser true ou false." };
  }
  const normalizedFeedUrl = feedUrl === undefined || feedUrl === null ? null : feedUrl;
  if (normalizedFeedUrl !== null && !isHttpUrl(normalizedFeedUrl)) {
    return { valid: false, error: "feedUrl inválido." };
  }
  if (enabled && !normalizedFeedUrl) {
    return { valid: false, error: "Configure o link do blog antes de habilitar as publicações." };
  }
  return { valid: true, config: { enabled, feedUrl: normalizedFeedUrl } };
}
