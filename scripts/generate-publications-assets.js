#!/usr/bin/env node
// scripts/generate-publications-assets.js
//
// Gerador ÚNICO (mesmo padrão de scripts/generate-video-youtube-assets.js
// e scripts/generate-tour-360-assets.js) — não roda em runtime. Escreve
// frontend/shared/publications.generated.js a partir de
// modules/publications/index.js (§47, módulo publications) para que vire
// um Static Asset real (§94): Workers Static Assets só publica arquivos
// dentro de `frontend/` (wrangler.toml `[assets] directory = "frontend"`),
// então esse arquivo não pode viver só em `modules/publications/`.
//
// Rodar sempre que modules/publications/index.js ou
// modules/publications/config.js mudarem:
//
//   npm run generate:publications
//
// O arquivo gerado é commitado (mesmo espírito de
// business/data/cities-catalog.generated.js) — nunca editar à mão.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFrontendModuleSource } from "../modules/publications/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "frontend", "shared", "publications.generated.js");

function main() {
  writeFileSync(OUTPUT_PATH, renderFrontendModuleSource());
  console.log(`OK — módulo publications escrito em ${OUTPUT_PATH}`);
}

main();
