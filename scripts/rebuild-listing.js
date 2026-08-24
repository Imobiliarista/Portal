#!/usr/bin/env node
// scripts/rebuild-listing.js
//
// CLI para business/publishing.js#rebuildListing (§33, Etapa 6). Usa
// `getPlatformProxy` do próprio wrangler (já devDependency deste repo) para
// obter os bindings reais de R2 (IMOB_PRIVATE/IMOB_DATA) a partir de
// wrangler.toml — sem isso, um script Node standalone não teria como falar
// com R2 sem inventar sua própria credencial (§93 não-regressão: nenhuma
// credencial de R2 fora do Worker).
//
// Uso:
//   node scripts/rebuild-listing.js <listingId>

import { getPlatformProxy } from "wrangler";
import { rebuildListing } from "../business/publishing.js";

async function main() {
  const [listingId] = process.argv.slice(2);
  if (!listingId) {
    console.error("Uso: node scripts/rebuild-listing.js <listingId>");
    process.exitCode = 1;
    return;
  }

  const { env, dispose } = await getPlatformProxy();
  try {
    const result = await rebuildListing(env, listingId);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
