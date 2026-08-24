#!/usr/bin/env node
// scripts/generate-financing-calculator-assets.js
//
// Gerador ÚNICO (mesmo padrão de scripts/generate-comparison-assets.js) —
// não roda em runtime. Escreve
// frontend/shared/financing-calculator.generated.js a partir de
// modules/financing-calculator/index.js (§44, módulo financing-calculator)
// para que vire um Static Asset real (§94): Workers Static Assets só
// publica arquivos dentro de `frontend/` (wrangler.toml `[assets]
// directory = "frontend"`), então esse arquivo não pode viver só em
// `modules/financing-calculator/`.
//
// Rodar sempre que modules/financing-calculator/index.js ou config.js
// mudar:
//
//   npm run generate:financing-calculator
//
// O arquivo gerado é commitado (mesmo espírito de
// business/data/cities-catalog.generated.js) — nunca editar à mão.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFrontendModuleSource } from "../modules/financing-calculator/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "frontend", "shared", "financing-calculator.generated.js");

function main() {
  writeFileSync(OUTPUT_PATH, renderFrontendModuleSource());
  console.log(`OK — módulo financing-calculator escrito em ${OUTPUT_PATH}`);
}

main();
