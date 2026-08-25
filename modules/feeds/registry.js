// modules/feeds/registry.js
//
// Módulo feeds (§46) — registro de portais suportados. Mantém
// modules/feeds/generator.js desacoplado de qual portal específico existe:
// adicionar formatters/zap.js (pendência deste lote, ver README) deveria
// significar só uma nova entrada aqui, nenhuma mudança em generator.js.
//
// Cada entrada é `{ formatFeed, fileName }`:
//   - `formatFeed(items, header)` — a função pura do formatter
//     (formatters/olx.js#formatOlxFeed), mesma assinatura para todo portal.
//   - `fileName` — o nome do arquivo (sem prefixo `feeds/`) que
//     storage/keys.js#dataKeys.feed(portalId) usa para montar a chave R2
//     (`feeds/${fileName}`, hoje sempre igual ao portalId — mantido como
//     campo próprio em vez de derivado, para o dia em que um portal
//     precisar de um nome de arquivo diferente do seu id de registro).

import { formatOlxFeed } from "./formatters/olx.js";

export const FEED_FORMATTERS = Object.freeze({
  olx: Object.freeze({ formatFeed: formatOlxFeed, fileName: "olx" }),
  // zap: pendência explícita deste lote — ver modules/feeds/README.md.
});

export const FEED_PORTAL_IDS = Object.freeze(Object.keys(FEED_FORMATTERS));
