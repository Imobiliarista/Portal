// frontend/shared/feeds.generated.js
//
// GERADO por scripts/generate-feeds-assets.js a partir de
// modules/feeds/registry.js + modules/feeds/config.js — não editar à mão
// (§46, módulo feeds, "Modo Exportação"). Regenerar com:
// npm run generate:feeds

export const FEED_SUBMODULES_PUBLIC = [
  {
    "id": "vrsync",
    "displayName": "OLX / ZAP / VivaReal (padrão VrSync)"
  }
];

const FEEDS_MODULE_KEY = "feeds";
const DEFAULT_FEED_SUBMODULE_CONFIG = Object.freeze({ enabled: false });

export function readFeedSubmoduleConfig(broker, submoduleId) {
  const raw = broker?.modules?.[FEEDS_MODULE_KEY]?.[submoduleId];
  if (!raw || typeof raw !== "object") return DEFAULT_FEED_SUBMODULE_CONFIG;
  return { enabled: raw.enabled === true };
}
