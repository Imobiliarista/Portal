// modules/feeds/config.js
//
// Módulo feeds (§46) — forma, leitura e validação de `broker.modules.feeds`
// (`{enabled}`, decisão de produto deste lote — opt-in por corretor, ver
// modules/feeds/README.md#decisões). Split out of index.js (§67 doesn't
// actually list a config.js for this module, unlike modules/publications)
// purely to avoid a circular import: modules/feeds/generator.js needs
// `readFeedsConfig` too, and modules/feeds/index.js re-exports
// generator.js — keeping this in index.js would make
// index.js -> generator.js -> index.js. No browser-bundle constraint
// applies here (contrast with modules/publications/config.js's reason for
// existing) — this file is server-only, never reaches the browser.

export const FEEDS_MODULE_KEY = "feeds";

/** Default state for a corretor who never configured this module. */
export const DEFAULT_FEEDS_CONFIG = Object.freeze({ enabled: false });

/**
 * Reads `broker.modules.feeds` (the private draft — the only place this is
 * ever read from; business/publishing.js#normalizeBrokerForPublic also
 * copies `modules` through to the public broker profile verbatim, but
 * nothing public-facing needs to read this specific key back) with a safe
 * default. Never throws: entrada ausente/malformada vira
 * `DEFAULT_FEEDS_CONFIG`.
 */
export function readFeedsConfig(broker) {
  const raw = broker?.modules?.[FEEDS_MODULE_KEY];
  if (!raw || typeof raw !== "object") return DEFAULT_FEEDS_CONFIG;
  return { enabled: raw.enabled === true };
}

/**
 * Validates `{enabled}` before it's written into a broker's `modules`
 * patch. Mirrors modules/publications/config.js#validatePublicationsConfig's
 * spirit — never lança, quem chama decide como exibir o erro — but this
 * field has no dependent sub-field to guard (`publications` needs a
 * resolved `feedUrl` before `enabled: true` makes sense; `feeds` doesn't —
 * the generator itself decides per-listing eligibility at generation time,
 * not at config-write time).
 */
export function validateFeedsConfig({ enabled } = {}) {
  if (typeof enabled !== "boolean") {
    return { valid: false, error: "enabled precisa ser true ou false." };
  }
  return { valid: true, config: { enabled } };
}
