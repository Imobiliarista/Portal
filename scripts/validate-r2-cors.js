#!/usr/bin/env node
// scripts/validate-r2-cors.js
//
// Valida `config/r2/imob-data-cors.json` (Etapa 7) — a política CORS
// versionada que o painel Cloudflare deve espelhar no Custom Domain do
// bucket `imob-data` (docs/OPERATIONS.md). Este script NUNCA aplica a
// política remotamente (Etapa 7 "não aplique a política remotamente
// durante testes ou PR") — só confere, localmente, que o arquivo é JSON
// válido e satisfaz as invariantes de "somente leitura pública":
//
//   - só GET/HEAD em AllowedMethods (nenhum método de escrita);
//   - nenhum header de autenticação em AllowedHeaders;
//   - nenhum domínio privado (`*.private.*`, `imob-private`, etc.) em
//     AllowedOrigins.
//
// Dependency-free (§94), mesmo estilo de scripts/validate-json.js.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CORS_POLICY_PATH = join(__dirname, "..", "config", "r2", "imob-data-cors.json");

const WRITE_METHODS = ["PUT", "POST", "PATCH", "DELETE"];
const AUTH_HEADER_PATTERN = /authorization|cookie|x-api-key|x-auth/i;
const PRIVATE_DOMAIN_HINTS = ["imob-private", "private.imobiliarista"];

/**
 * Valida um array de regras CORS já parseado (não lê disco) — puro,
 * reutilizável em testes. Retorna `{ valid, problems }`; nunca lança.
 */
export function validateCorsPolicy(policy) {
  const problems = [];

  if (!Array.isArray(policy) || policy.length === 0) {
    return { valid: false, problems: ["a política deve ser um array não vazio de regras CORS."] };
  }

  policy.forEach((rule, index) => {
    const label = `regra[${index}]`;
    if (!Array.isArray(rule.AllowedMethods) || rule.AllowedMethods.length === 0) {
      problems.push(`${label}: AllowedMethods ausente/vazio.`);
    } else {
      const writeMethodsFound = rule.AllowedMethods.filter((method) => WRITE_METHODS.includes(method));
      if (writeMethodsFound.length > 0) {
        problems.push(`${label}: método(s) de escrita não permitido(s) — ${writeMethodsFound.join(", ")}.`);
      }
      const unknownMethods = rule.AllowedMethods.filter((method) => !["GET", "HEAD"].includes(method));
      if (unknownMethods.length > 0) {
        problems.push(`${label}: método(s) inesperado(s) (só GET/HEAD são permitidos) — ${unknownMethods.join(", ")}.`);
      }
    }

    for (const header of rule.AllowedHeaders ?? []) {
      if (AUTH_HEADER_PATTERN.test(header)) {
        problems.push(`${label}: header de autenticação não deveria estar em AllowedHeaders — "${header}".`);
      }
    }

    for (const origin of rule.AllowedOrigins ?? []) {
      const lower = origin.toLowerCase();
      if (PRIVATE_DOMAIN_HINTS.some((hint) => lower.includes(hint))) {
        problems.push(`${label}: origem parece apontar para um domínio privado — "${origin}".`);
      }
    }

    if (rule.MaxAgeSeconds !== undefined && (typeof rule.MaxAgeSeconds !== "number" || rule.MaxAgeSeconds < 0)) {
      problems.push(`${label}: MaxAgeSeconds deve ser um número >= 0.`);
    }
  });

  return { valid: problems.length === 0, problems };
}

function main() {
  let raw;
  try {
    raw = readFileSync(CORS_POLICY_PATH, "utf8");
  } catch (error) {
    console.error(`Não foi possível ler ${CORS_POLICY_PATH}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  let policy;
  try {
    policy = JSON.parse(raw);
  } catch (error) {
    console.error(`${CORS_POLICY_PATH}: JSON inválido — ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const { valid, problems } = validateCorsPolicy(policy);
  if (!valid) {
    console.error(`${problems.length} problema(s) encontrado(s) em ${CORS_POLICY_PATH}:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log(`OK — ${CORS_POLICY_PATH} é uma política CORS somente-leitura válida.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
