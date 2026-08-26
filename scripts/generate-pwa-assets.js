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

import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifestObject } from "../modules/pwa/manifest.js";
import { renderServiceWorkerSource, computeShellVersion, PWA_SHELL_ASSETS } from "../modules/pwa/service-worker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = join(__dirname, "..", "frontend");
const MANIFEST_OUTPUT_PATH = join(FRONTEND_DIR, "manifest.json");
const SERVICE_WORKER_OUTPUT_PATH = join(FRONTEND_DIR, "service-worker.js");

/**
 * Lê o conteúdo real de cada shell asset em frontend/ (o próprio manifest
 * já foi gerado nesta mesma execução, então usa a string em memória em vez
 * de reler do disco) para `computeShellVersion` hashear — é esse conteúdo
 * real, não um número bumpado à mão, que decide se o cache do shell
 * precisa invalidar num deploy novo.
 */
function readShellAssetContents(manifestJson) {
  const contents = {};
  for (const path of PWA_SHELL_ASSETS) {
    if (path === "/manifest.json") {
      contents[path] = manifestJson;
      continue;
    }
    const relativePath = path === "/" ? "index.html" : path.replace(/^\//, "");
    contents[path] = readFileSync(join(FRONTEND_DIR, relativePath), "utf8");
  }
  return contents;
}

function main() {
  const manifestJson = `${JSON.stringify(buildManifestObject(), null, 2)}\n`;
  writeFileSync(MANIFEST_OUTPUT_PATH, manifestJson);
  console.log(`OK — manifest escrito em ${MANIFEST_OUTPUT_PATH}`);

  const version = computeShellVersion(readShellAssetContents(manifestJson));
  const serviceWorkerSource = renderServiceWorkerSource({ version });
  writeFileSync(SERVICE_WORKER_OUTPUT_PATH, serviceWorkerSource);
  console.log(`OK — service worker escrito em ${SERVICE_WORKER_OUTPUT_PATH} (shell version ${version})`);
}

main();
