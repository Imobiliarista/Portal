#!/usr/bin/env node
// scripts/generate-appointments-assets.js
//
// Gerador ÚNICO (mesmo padrão de scripts/generate-financing-calculator-assets.js) —
// não roda em runtime. Escreve frontend/shared/appointments.generated.js a
// partir de modules/appointments/index.js (§41, módulo appointments) para
// que vire um Static Asset real (§94): Workers Static Assets só publica
// arquivos dentro de `frontend/` (wrangler.toml `[assets] directory =
// "frontend"`), então esse arquivo não pode viver só em
// `modules/appointments/`.
//
// Rodar sempre que modules/appointments/index.js ou validation.js mudar:
//
//   npm run generate:appointments
//
// O arquivo gerado é commitado (mesmo espírito de
// business/data/cities-catalog.generated.js) — nunca editar à mão.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFrontendModuleSource } from "../modules/appointments/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "frontend", "shared", "appointments.generated.js");

function main() {
  writeFileSync(OUTPUT_PATH, renderFrontendModuleSource());
  console.log(`OK — módulo appointments escrito em ${OUTPUT_PATH}`);
}

main();
