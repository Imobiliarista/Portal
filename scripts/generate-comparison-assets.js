#!/usr/bin/env node
// scripts/generate-comparison-assets.js
//
// Gerador ÚNICO (mesmo padrão de scripts/generate-tour-360-assets.js) — não
// roda em runtime. Escreve frontend/shared/comparison.generated.js a partir
// de modules/comparison/index.js (§45, módulo comparison) para que vire um
// Static Asset real (§94): Workers Static Assets só publica arquivos dentro
// de `frontend/` (wrangler.toml `[assets] directory = "frontend"`), então
// esse arquivo não pode viver só em `modules/comparison/`.
//
// Rodar sempre que modules/comparison/index.js mudar:
//
//   npm run generate:comparison
//
// O arquivo gerado é commitado (mesmo espírito de
// business/data/cities-catalog.generated.js) — nunca editar à mão.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFrontendModuleSource } from "../modules/comparison/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "frontend", "shared", "comparison.generated.js");

function main() {
  writeFileSync(OUTPUT_PATH, renderFrontendModuleSource());
  console.log(`OK — módulo comparison escrito em ${OUTPUT_PATH}`);
}

main();
