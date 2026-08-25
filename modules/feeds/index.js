// modules/feeds/index.js
//
// Módulo feeds (§46) — ponto de entrada. §46 only sketches the file tree
// (index.js, registry.js, formatters/, generator.js, README.md) and says
// "Exports ficam no R2" — it does not say whether every corretor's active
// listings go into the feed automatically or whether it's opt-in per
// corretor. Decision confirmed for this lot (see README#decisões): **opt-in
// per corretor**, same shape/place as modules/publications —
// `broker.modules.feeds.enabled` (schemas/broker.schema.json#modules is
// already `additionalProperties: true`, "shape owned by each module, not
// by core" — no schema change needed, exactly like publications). The
// `{enabled}` read/validate helpers themselves live in
// modules/feeds/config.js — see that file's header for why they're split
// out (a circular-import concern, not the browser-bundle reason
// modules/publications split its own config.js out for).
//
// Unlike every other Etapa 9 module built so far, this one needs NO
// browser bundle at all: there is no painel UI in this lot's scope (see
// README pendências) and the XML itself is generated entirely server-side
// by modules/feeds/generator.js, consumed by an external portal's crawler
// — never by this project's own frontend.

export { FEEDS_MODULE_KEY, DEFAULT_FEEDS_CONFIG, readFeedsConfig, validateFeedsConfig } from "./config.js";
export { FEED_FORMATTERS, FEED_PORTAL_IDS } from "./registry.js";
export { regenerateFeeds, collectFeedItems, buildFeedHeader } from "./generator.js";
