#!/usr/bin/env node
// scripts/generate-cities-catalog.js
//
// Gerador ÚNICO (não é chamado em runtime — §94, sem nova dependência de
// rede para algo que pode ser dado estático versionado no Git). Busca
// todos os municípios do Brasil na API de Localidades do IBGE e escreve
// business/data/cities-catalog.generated.js (slug -> { name, uf, ibgeCode }),
// consumido por business/cities.js para resolver `city.name`/`city.uf`
// (exigidos por city-manifest.schema.json, §12) a partir do `city` (slug
// livre) que business/listings.js guarda no draft do anúncio.
//
// Rodar manualmente, de um ambiente com acesso de rede a
// servicodados.ibge.gov.br (esta sessão de trabalho da Etapa 6 não tinha —
// ver docs/OPERATIONS.md e o PR):
//
//   node scripts/generate-cities-catalog.js
//
// Regenerar sempre que a lista de municípios do IBGE mudar (raro, mas
// acontece — criação/desmembramento de município). O arquivo gerado é
// commitado; o publicador nunca busca isso em runtime.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "business", "data", "cities-catalog.generated.js");
const IBGE_MUNICIPIOS_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";

// Combining diacritical marks (U+0300-U+036F) left behind by NFD
// normalization — written as an escaped range (not literal combining
// characters) so the source file itself stays unambiguous to read/diff.
const COMBINING_MARKS_PATTERN = new RegExp("[\\u0300-\\u036f]", "g");

function stripDiacritics(value) {
  return value.normalize("NFD").replace(COMBINING_MARKS_PATTERN, "");
}

/** Same slug shape used everywhere else in this repo (storage/keys.js, §7-§9 examples): lowercase, hyphen-separated. */
function slugify(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The IBGE municípios payload nests UF two different ways depending on API
 * version/vintage (`microrregiao.mesorregiao.UF` is the older shape,
 * `regiao-imediata.regiao-intermediaria.UF` the newer one) — both are
 * present in current responses. Try both defensively.
 */
function resolveUf(municipio) {
  const uf = municipio?.microrregiao?.mesorregiao?.UF ?? municipio?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF;
  if (!uf?.sigla || !uf?.nome) {
    throw new Error(`Não foi possível resolver a UF do município IBGE ${municipio?.id} (${municipio?.nome}).`);
  }
  return uf;
}

async function fetchMunicipios() {
  const response = await fetch(IBGE_MUNICIPIOS_URL);
  if (!response.ok) {
    throw new Error(`IBGE respondeu HTTP ${response.status} em ${IBGE_MUNICIPIOS_URL}`);
  }
  return response.json();
}

/**
 * Builds slug -> { name, uf, ibgeCode }. Brazil has several municípios that
 * share a name across different UFs (e.g. "Bom Jesus" in PI/RS/GO/...) — any
 * slug collision is disambiguated by appending the UF, and the astronomically
 * unlikely case of a further collision (same name, same UF) falls back to
 * the IBGE code, so every município always gets a unique, deterministic slug.
 */
function buildCatalog(municipios) {
  const baseSlugCounts = new Map();
  const resolved = municipios.map((municipio) => {
    const uf = resolveUf(municipio);
    const baseSlug = slugify(municipio.nome);
    baseSlugCounts.set(baseSlug, (baseSlugCounts.get(baseSlug) ?? 0) + 1);
    return { municipio, uf, baseSlug };
  });

  const catalog = {};
  const usedSlugs = new Set();
  for (const { municipio, uf, baseSlug } of resolved) {
    const needsDisambiguation = baseSlugCounts.get(baseSlug) > 1;
    let slug = needsDisambiguation ? `${baseSlug}-${uf.sigla.toLowerCase()}` : baseSlug;
    if (usedSlugs.has(slug)) {
      slug = `${slug}-${municipio.id}`;
    }
    usedSlugs.add(slug);
    catalog[slug] = { name: municipio.nome, uf: uf.sigla, ibgeCode: municipio.id };
  }
  return catalog;
}

function renderModule(catalog) {
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const entries = Object.keys(catalog)
    .sort()
    .map((slug) => `  ${JSON.stringify(slug)}: ${JSON.stringify(catalog[slug])},`)
    .join("\n");

  return `// business/data/cities-catalog.generated.js
//
// GERADO por scripts/generate-cities-catalog.js — não editar à mão.
// Fonte: IBGE Localidades API (municípios), snapshot ${snapshotDate}.
// Regenerar com: node scripts/generate-cities-catalog.js

export const CITY_CATALOG = {
${entries}
};
`;
}

async function main() {
  const municipios = await fetchMunicipios();
  const catalog = buildCatalog(municipios);
  writeFileSync(OUTPUT_PATH, renderModule(catalog));
  console.log(`OK — ${Object.keys(catalog).length} município(s) escrito(s) em ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
