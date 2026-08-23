#!/usr/bin/env node
// scripts/validate-json.js
//
// Sanity-checks every schemas/*.schema.json file: valid JSON, and carries
// the minimum structure a JSON Schema needs ($schema, $id, type). This is
// intentionally dependency-free (§94 — no new package unless nothing
// simpler works) rather than pulling in a full validator like ajv; real
// instance-vs-schema validation belongs to a later etapa once business/
// actually produces objects to validate.

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = join(__dirname, "..", "schemas");

function listSchemaFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSchemaFiles(path);
    if (entry.name.endsWith(".schema.json")) return [path];
    return [];
  });
}

function main() {
  const files = listSchemaFiles(schemasDir);
  if (files.length === 0) {
    console.error(`Nenhum *.schema.json encontrado em ${schemasDir}`);
    process.exitCode = 1;
    return;
  }

  const errors = [];

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      errors.push(`${file}: JSON inválido — ${error.message}`);
      continue;
    }
    for (const key of ["$schema", "$id", "type"]) {
      if (!(key in parsed)) {
        errors.push(`${file}: campo obrigatório "${key}" ausente.`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`${errors.length} problema(s) encontrado(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`OK — ${files.length} schema(s) válido(s) em ${schemasDir}`);
}

main();
