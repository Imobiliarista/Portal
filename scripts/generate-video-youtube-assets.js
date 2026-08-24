#!/usr/bin/env node
// scripts/generate-video-youtube-assets.js
//
// Gerador ÚNICO (mesmo padrão de scripts/generate-pwa-assets.js) — não
// roda em runtime. Escreve frontend/shared/video-youtube.generated.js a
// partir de modules/video-youtube/index.js (§50, módulo video-youtube)
// para que vire um Static Asset real (§94): Workers Static Assets só
// publica arquivos dentro de `frontend/`
// (wrangler.toml `[assets] directory = "frontend"`), então esse arquivo
// não pode viver só em `modules/video-youtube/`.
//
// Rodar sempre que modules/video-youtube/index.js mudar:
//
//   npm run generate:video-youtube
//
// O arquivo gerado é commitado (mesmo espírito de
// business/data/cities-catalog.generated.js) — nunca editar à mão.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFrontendModuleSource } from "../modules/video-youtube/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "frontend", "shared", "video-youtube.generated.js");

function main() {
  writeFileSync(OUTPUT_PATH, renderFrontendModuleSource());
  console.log(`OK — módulo video-youtube escrito em ${OUTPUT_PATH}`);
}

main();
