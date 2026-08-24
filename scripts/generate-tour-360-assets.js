#!/usr/bin/env node
// scripts/generate-tour-360-assets.js
//
// Gerador ÚNICO (mesmo padrão de scripts/generate-video-youtube-assets.js) —
// não roda em runtime. Escreve frontend/shared/tour-360.generated.js a
// partir de modules/tour-360/index.js (§49, módulo tour-360) para que
// vire um Static Asset real (§94): Workers Static Assets só publica
// arquivos dentro de `frontend/`
// (wrangler.toml `[assets] directory = "frontend"`), então esse arquivo
// não pode viver só em `modules/tour-360/`.
//
// Rodar sempre que modules/tour-360/index.js mudar:
//
//   npm run generate:tour-360
//
// O arquivo gerado é commitado (mesmo espírito de
// business/data/cities-catalog.generated.js) — nunca editar à mão.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFrontendModuleSource } from "../modules/tour-360/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "frontend", "shared", "tour-360.generated.js");

function main() {
  writeFileSync(OUTPUT_PATH, renderFrontendModuleSource());
  console.log(`OK — módulo tour-360 escrito em ${OUTPUT_PATH}`);
}

main();
