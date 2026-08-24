#!/usr/bin/env node
// scripts/rebuild-city.js
//
// CLI para business/publishing.js#rebuildCity (§33, Etapa 6) — reconstrói
// manifest + shard(s) + index de UMA cidade inteira a partir do estado
// privado (via storage/indexes.js#getCityListingIds, sem varrer o bucket).
// Ver scripts/rebuild-listing.js para a justificativa de usar
// `getPlatformProxy` do wrangler.
//
// Uso:
//   node scripts/rebuild-city.js <citySlug>

import { getPlatformProxy } from "wrangler";
import { rebuildCity } from "../business/publishing.js";

async function main() {
  const [citySlug] = process.argv.slice(2);
  if (!citySlug) {
    console.error("Uso: node scripts/rebuild-city.js <citySlug>");
    process.exitCode = 1;
    return;
  }

  const { env, dispose } = await getPlatformProxy();
  try {
    const result = await rebuildCity(env, citySlug);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
