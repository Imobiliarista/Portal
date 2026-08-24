#!/usr/bin/env node
// scripts/generate-pwa-assets.js
//
// Gerador ÚNICO (mesmo padrão de scripts/generate-cities-catalog.js) —
// não roda em runtime. Escreve frontend/manifest.json e
// frontend/service-worker.js a partir das fontes em modules/pwa/
// (§48, módulo pwa) para que virem Static Assets reais (§94): Workers
// Static Assets só publica arquivos dentro de `frontend/`
// (wrangler.toml `[assets] directory = "frontend"`), então esses dois
// arquivos não podem viver só em `modules/pwa/`.
//
// Rodar sempre que modules/pwa/manifest.js, modules/pwa/service-worker.js
// ou storage/cache.js#CACHE_TTL_SECONDS mudarem:
//
//   npm run generate:pwa
//
// Os arquivos gerados são commitados (mesmo espírito de
// business/data/cities-catalog.generated.js) — nunca editar à mão.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifestObject } from "../modules/pwa/manifest.js";
import { renderServiceWorkerSource } from "../modules/pwa/service-worker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = join(__dirname, "..", "frontend");
const MANIFEST_OUTPUT_PATH = join(FRONTEND_DIR, "manifest.json");
const SERVICE_WORKER_OUTPUT_PATH = join(FRONTEND_DIR, "service-worker.js");

function main() {
  const manifestJson = `${JSON.stringify(buildManifestObject(), null, 2)}\n`;
  writeFileSync(MANIFEST_OUTPUT_PATH, manifestJson);
  console.log(`OK — manifest escrito em ${MANIFEST_OUTPUT_PATH}`);

  const serviceWorkerSource = renderServiceWorkerSource();
  writeFileSync(SERVICE_WORKER_OUTPUT_PATH, serviceWorkerSource);
  console.log(`OK — service worker escrito em ${SERVICE_WORKER_OUTPUT_PATH}`);
}

main();
