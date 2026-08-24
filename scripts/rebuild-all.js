#!/usr/bin/env node
// scripts/rebuild-all.js
//
// CLI para business/publishing.js#rebuildAll (§34, Etapa 6) — rebuild em
// lote de todas as cidades conhecidas
// (storage/indexes.js#getKnownCitySlugs), processadas em lotes
// checkpointáveis (jobs/rebuild-all/checkpoint.json em R2 PRIVATE), nunca
// tudo de uma vez numa execução curta (§34). Ver scripts/rebuild-listing.js
// para a justificativa de usar `getPlatformProxy` do wrangler.
//
// Uso:
//   node scripts/rebuild-all.js                 # processa 1 lote e para
//   node scripts/rebuild-all.js --all            # processa lotes até terminar
//   node scripts/rebuild-all.js --batch-size=50  # tamanho de lote customizado
//
// Sem --all, rodar de novo retoma do checkpoint salvo (retomável,
// idempotente — §34) em vez de recomeçar do zero.

import { getPlatformProxy } from "wrangler";
import { rebuildAll } from "../business/publishing.js";

function parseArgs(argv) {
  const all = argv.includes("--all");
  const batchSizeArg = argv.find((arg) => arg.startsWith("--batch-size="));
  const batchSize = batchSizeArg ? Number(batchSizeArg.split("=")[1]) : undefined;
  return { all, batchSize };
}

function logBatch(result) {
  console.log(`Lote processado: ${result.processedCities.length} cidade(s) — ${result.nextCursor}/${result.totalCities}.`);
}

async function main() {
  const { all, batchSize } = parseArgs(process.argv.slice(2));

  const { env, dispose } = await getPlatformProxy();
  try {
    let result = await rebuildAll(env, { batchSize });
    logBatch(result);

    while (all && !result.done) {
      result = await rebuildAll(env, { batchSize });
      logBatch(result);
    }

    console.log(
      result.done
        ? "Rebuild completo — todas as cidades processadas."
        : "Ainda há cidades pendentes — rode de novo (retoma do checkpoint) ou use --all.",
    );
  } finally {
    await dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
