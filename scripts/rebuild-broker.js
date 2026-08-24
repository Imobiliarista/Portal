#!/usr/bin/env node
// scripts/rebuild-broker.js
//
// CLI para business/publishing.js#rebuildBroker (§33, Etapa 6) — republica
// brokers/{slug}/profile.json a partir do perfil privado, ignorando a
// checagem de staleness que `publishBroker` usa no caminho normal (útil
// para corrigir divergência, §33). Ver scripts/rebuild-listing.js para a
// justificativa de usar `getPlatformProxy` do wrangler.
//
// Uso:
//   node scripts/rebuild-broker.js <brokerId>

import { getPlatformProxy } from "wrangler";
import { rebuildBroker } from "../business/publishing.js";

async function main() {
  const [brokerId] = process.argv.slice(2);
  if (!brokerId) {
    console.error("Uso: node scripts/rebuild-broker.js <brokerId>");
    process.exitCode = 1;
    return;
  }

  const { env, dispose } = await getPlatformProxy();
  try {
    const result = await rebuildBroker(env, brokerId);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
