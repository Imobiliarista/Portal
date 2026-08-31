#!/usr/bin/env node
// scripts/generate-amenities-assets.js
//
// Gerador ÚNICO (mesmo padrão de scripts/generate-comparison-assets.js) —
// não roda em runtime. Escreve frontend/shared/amenities.generated.js a
// partir de business/amenities.js#AMENITIES para que vire um Static Asset
// real (§94): Workers Static Assets só publica arquivos dentro de
// `frontend/` (wrangler.toml `[assets] directory = "frontend"`), então
// business/amenities.js não é alcançável pelo painel sem esse passo.
//
// Rodar sempre que business/amenities.js#AMENITIES mudar:
//
//   npm run generate:amenities
//
// O arquivo gerado é commitado (mesmo espírito de
// business/data/cities-catalog.generated.js) — nunca editar à mão.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AMENITIES } from "../business/amenities.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "frontend", "shared", "amenities.generated.js");

function renderSource() {
  const entries = AMENITIES.map((amenity) => `  { id: ${JSON.stringify(amenity.id)}, label: ${JSON.stringify(amenity.label)} },`).join(
    "\n",
  );
  return `// frontend/shared/amenities.generated.js
//
// GERADO por scripts/generate-amenities-assets.js a partir de
// business/amenities.js#AMENITIES — não editar à mão. Regenerar com:
// npm run generate:amenities

export const AMENITIES = Object.freeze([
${entries}
]);
`;
}

function main() {
  writeFileSync(OUTPUT_PATH, renderSource());
  console.log(`OK — módulo amenities escrito em ${OUTPUT_PATH}`);
}

main();
