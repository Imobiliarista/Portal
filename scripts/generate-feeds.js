#!/usr/bin/env node
// scripts/generate-feeds.js
//
// CLI para modules/feeds/generator.js#regenerateFeeds (§46, Etapa 9).
// Regenera feeds/{portal}.xml em R2 DATA a partir do estado privado atual
// (todo corretor ativo com `modules.feeds.enabled`) — o mesmo caminho que
// worker/api.js e worker/admin.js já disparam automaticamente em cada
// escrita relevante de um corretor opt-in (ver os dois arquivos para o
// porquê do gate). Este script existe para o caso que esse gate não
// cobre: nenhum Cron Trigger da Cloudflare está implementado ainda
// (worker/cron.js continua placeholder, README#pendências) — até que
// exista, isto é o caminho manual/externo (cron do SO, GitHub Action,
// etc.) para manter o(s) feed(s) em dia sem depender de uma escrita
// específica ter acontecido. Ver scripts/rebuild-listing.js para a
// justificativa de usar `getPlatformProxy` do wrangler.
//
// Uso:
//   node scripts/generate-feeds.js            # todos os portais registrados
//   node scripts/generate-feeds.js olx         # só um portal

import { getPlatformProxy } from "wrangler";
import { regenerateFeeds } from "../modules/feeds/generator.js";

async function main() {
  const [portalId] = process.argv.slice(2);

  const { env, dispose } = await getPlatformProxy();
  try {
    const result = await regenerateFeeds(env, portalId ? { portals: [portalId] } : {});
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
