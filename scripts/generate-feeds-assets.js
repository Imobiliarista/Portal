#!/usr/bin/env node
// scripts/generate-feeds-assets.js
//
// Gerador ÚNICO (mesmo padrão de scripts/generate-publications-assets.js
// e scripts/generate-video-youtube-assets.js) — não roda em runtime.
// Escreve frontend/shared/feeds.generated.js a partir de
// modules/feeds/index.js#renderFrontendModuleSource (§46, módulo feeds,
// "Modo Exportação") para que vire um Static Asset real (§94): Workers
// Static Assets só publica arquivos dentro de `frontend/`
// (wrangler.toml `[assets] directory = "frontend"`), então nem
// modules/feeds/registry.js nem modules/feeds/config.js são alcançáveis
// pelo painel sem esse passo.
//
// Rodar sempre que modules/feeds/registry.js ou modules/feeds/config.js
// mudarem (ex.: um submódulo novo entrando no registry):
//
//   npm run generate:feeds
//
// O arquivo gerado é commitado (mesmo espírito de
// business/data/cities-catalog.generated.js) — nunca editar à mão.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFrontendModuleSource } from "../modules/feeds/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "frontend", "shared", "feeds.generated.js");

function main() {
  writeFileSync(OUTPUT_PATH, renderFrontendModuleSource());
  console.log(`OK — módulo feeds escrito em ${OUTPUT_PATH}`);
}

main();
