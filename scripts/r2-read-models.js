#!/usr/bin/env node
// scripts/r2-read-models.js
//
// Executor oficial do adapter IMOB_PRIVATE -> IMOB_DATA
// (business/r2ReadModelsAdapter.js, Etapa 5 — missão "materializa read
// models R2 e encerra carregamento infinito"). Dois modos:
//
//   node scripts/r2-read-models.js validate
//     Nunca exige credenciais, nunca abre conexão remota. Roda o pipeline
//     inteiro (enumerate -> validate -> reconcile -> plan -> apply) contra
//     um `env` em memória (FakeR2Bucket), semeado por
//     scripts/fixtures/r2-read-models-fixture.js — fixture local
//     determinística construída com as próprias funções de negócio reais,
//     nunca um JSON hand-copiado. Este é o modo que o job `validate` do
//     workflow (.github/workflows/publish-r2-read-models.yml, Etapa 6)
//     executa, sem nenhum secret disponível para o job.
//
//   node scripts/r2-read-models.js publish
//     Exige TODOS os guards abaixo, na ordem, antes de tocar em R2 de
//     verdade. Fala com a API REST oficial da Cloudflare para objetos R2
//     (`/accounts/{id}/r2/buckets/{bucket}/objects/{key}`, autenticação
//     Bearer com CLOUDFLARE_API_TOKEN) — nunca `wrangler deploy`, nunca
//     `wrangler whoami`, nunca login interativo, nunca altera o Worker
//     ativo, DNS, bindings ou secrets. Buckets alvo: `imob-private`
//     (leitura) e `imob-data` (leitura+escrita) — nomes fixos, iguais aos
//     já usados por `wrangler.toml`.
//
// Guards de `publish` (todos obrigatórios):
//   1. confirmação === "PUBLICAR_R2" (literal, via IMOB_R2_AUTHORIZATION
//      ou --confirm).
//   2. IMOB_R2_ENVIRONMENT === "production-r2" (redundante ao
//      `environment:` do workflow de propósito — este script pode ser
//      chamado fora dele por engano).
//   3. CLOUDFLARE_API_TOKEN presente (nunca logado/impresso — só o
//      comprimento, para confirmar não-vazio sem revelar o valor).
//   4. CLOUDFLARE_ACCOUNT_ID presente (mesma regra acima).
//   5. `validate` roda por completo (contra a fixture local) antes de
//      qualquer escrita remota — um pipeline que falhasse validação
//      estrutural nunca chega à fase de escrita real.
//   6. O plano resultante não pode conter nenhuma ação de exclusão —
//      `planGlobalCatalogs` nunca produz uma, mas o guard existe mesmo
//      assim (nunca confiar cegamente no próprio código).
//
// SEM `wrangler whoami`/`wrangler deploy`/promoção de versão/alteração de
// DNS/bindings/secrets em lugar nenhum deste arquivo.

import { publishReadModels, planGlobalCatalogs } from "../business/r2ReadModelsAdapter.js";
import { buildSampleFixtureEnv, buildEmptyFixtureEnv } from "./fixtures/r2-read-models-fixture.js";

export const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
export const REQUIRED_CONFIRMATION = "PUBLICAR_R2";
export const REQUIRED_ENVIRONMENT = "production-r2";
export const PRIVATE_BUCKET_NAME = "imob-private";
export const DATA_BUCKET_NAME = "imob-data";
const EXPECTED_GLOBAL_KEYS = ["portal/cities.json", "portal/taxonomy.json", "portal/modules.json"];

// --- publish: cliente R2 real via API REST oficial da Cloudflare -----------
//
// Implementa só `get`/`put` — a mesma superfície mínima que
// storage/private.js#getPrivate/storage/public.js#getPublic/putPublic já
// esperam de um binding (`bucket.get(key)` -> objeto com `.json()`;
// `bucket.put(key, body, { httpMetadata })`). Deliberadamente SEM
// `delete`/`list`: este executor nunca deveria conseguir apagar ou varrer
// um bucket real, então a capacidade nem existe na classe (Etapa 5 "sem
// operação de exclusão").

export class RemoteR2Bucket {
  constructor({ accountId, apiToken, bucketName }) {
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.bucketName = bucketName;
  }

  objectUrl(key) {
    return `${CLOUDFLARE_API_BASE}/accounts/${this.accountId}/r2/buckets/${this.bucketName}/objects/${encodeURIComponent(key)}`;
  }

  async get(key) {
    const response = await fetch(this.objectUrl(key), {
      method: "GET",
      headers: { Authorization: `Bearer ${this.apiToken}` },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`RemoteR2Bucket: GET "${key}" no bucket "${this.bucketName}" falhou (HTTP ${response.status}).`);
    }
    return { key, json: () => response.json(), text: () => response.text() };
  }

  async put(key, body, { httpMetadata } = {}) {
    const response = await fetch(this.objectUrl(key), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": httpMetadata?.contentType ?? "application/json; charset=utf-8",
      },
      body,
    });
    if (!response.ok) {
      throw new Error(`RemoteR2Bucket: PUT "${key}" no bucket "${this.bucketName}" falhou (HTTP ${response.status}).`);
    }
    return { key };
  }
}

// --- validações compartilhadas -----------------------------------------

/** Confere a forma do resultado do pipeline — usado nos dois modos. */
export function assertPipelineShape(result) {
  for (const field of ["enumeration", "validation", "plan", "report"]) {
    if (!(field in result)) {
      throw new Error(`scripts/r2-read-models: resultado sem campo obrigatório "${field}".`);
    }
  }
  if (result.plan.targets.length !== EXPECTED_GLOBAL_KEYS.length) {
    throw new Error(
      `scripts/r2-read-models: esperava ${EXPECTED_GLOBAL_KEYS.length} chave(s) no plano, achou ${result.plan.targets.length}.`,
    );
  }
  for (const key of EXPECTED_GLOBAL_KEYS) {
    if (!result.plan.targets.some((target) => target.key === key)) {
      throw new Error(`scripts/r2-read-models: plano não contém a chave obrigatória "${key}".`);
    }
  }
  const deleteActions = result.plan.targets.filter((target) => target.action === "delete");
  if (deleteActions.length > 0) {
    throw new Error("scripts/r2-read-models: plano contém ação de delete — abortando antes de qualquer escrita.");
  }
}

/**
 * Confere que origem e destino são exatamente os buckets esperados e
 * distintos entre si — guard explícito (Etapa 6 "validar que origem e
 * destino são distintos... a origem esperada é imob-private... o destino
 * esperado é imob-data"), redundante com os literais fixos já usados em
 * `runPublish`, mas nunca pulado.
 */
export function assertDistinctSourceAndDestination() {
  if (PRIVATE_BUCKET_NAME === DATA_BUCKET_NAME) {
    throw new Error("scripts/r2-read-models: origem e destino não podem ser o mesmo bucket.");
  }
  if (PRIVATE_BUCKET_NAME !== "imob-private") {
    throw new Error('scripts/r2-read-models: origem esperada é "imob-private".');
  }
  if (DATA_BUCKET_NAME !== "imob-data") {
    throw new Error('scripts/r2-read-models: destino esperado é "imob-data".');
  }
}

// --- modo validate -----------------------------------------------------

export async function runValidate({ log = console.log } = {}) {
  log("Modo: validate — sem credenciais, sem acesso remoto, fixtures locais.");

  // Estado vazio primeiro (Etapa 3 "estado vazio obrigatório") — prova, a
  // cada execução de CI, que uma instalação sem corretores/imóveis ainda
  // publica os 3 catálogos globais válidos (nunca 404) antes de validar o
  // caso com dados reais. Usa `planGlobalCatalogs` direto (não
  // `publishReadModels`, cujo `plan` retornado já vem enxuto, sem
  // `nextValue`) para poder inspecionar o conteúdo planejado de verdade.
  const emptyPlan = await planGlobalCatalogs(buildEmptyFixtureEnv());
  const emptyCitiesTarget = emptyPlan.targets.find((t) => t.key === "portal/cities.json");
  if (!emptyCitiesTarget || !Array.isArray(emptyCitiesTarget.nextValue.cities) || emptyCitiesTarget.nextValue.cities.length !== 0) {
    throw new Error("scripts/r2-read-models: estado vazio não produziu portal/cities.json com cities: [].");
  }
  const emptyResult = await publishReadModels(buildEmptyFixtureEnv());
  assertPipelineShape(emptyResult);

  const env = await buildSampleFixtureEnv();
  const result = await publishReadModels(env);
  assertPipelineShape(result);
  log(
    `Validação OK — estado vazio produz catálogos válidos; estado com dados: ${result.report.planned} chave(s) planejada(s), ${result.reconciliation?.brokersProcessed ?? 0} corretor(es) e ${result.reconciliation?.citiesProcessed ?? 0} cidade(s) reconciliados na fixture. Credenciais usadas: nenhuma. Acesso remoto: nenhum. Objetos alterados em produção: zero.`,
  );
  return result;
}

// --- modo publish --------------------------------------------------------

function requireEnvVar(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`scripts/r2-read-models: variável de ambiente "${name}" ausente ou vazia.`);
  }
  return value;
}

export async function runPublish({ confirmation, log = console.log } = {}) {
  log("Modo: publish — validando todos os guards antes de tocar em R2 real.");

  const confirmationValue = confirmation ?? process.env.IMOB_R2_AUTHORIZATION ?? "";
  if (confirmationValue !== REQUIRED_CONFIRMATION) {
    throw new Error(`scripts/r2-read-models: confirmação ausente/incorreta — esperado exatamente "${REQUIRED_CONFIRMATION}".`);
  }

  const environment = process.env.IMOB_R2_ENVIRONMENT ?? "";
  if (environment !== REQUIRED_ENVIRONMENT) {
    throw new Error(
      `scripts/r2-read-models: IMOB_R2_ENVIRONMENT deve ser exatamente "${REQUIRED_ENVIRONMENT}" (recebido: ${
        environment ? "valor presente, porém incorreto" : "ausente"
      }).`,
    );
  }

  const apiToken = requireEnvVar("CLOUDFLARE_API_TOKEN");
  const accountId = requireEnvVar("CLOUDFLARE_ACCOUNT_ID");
  log(
    `Credenciais presentes (valores nunca impressos) — CLOUDFLARE_API_TOKEN: ${apiToken.length} caractere(s); CLOUDFLARE_ACCOUNT_ID: ${accountId.length} caractere(s).`,
  );

  log("Rodando validação estrutural completa (fixtures locais) antes de qualquer escrita remota...");
  await runValidate({ log });
  assertDistinctSourceAndDestination();

  const env = {
    IMOB_PRIVATE: new RemoteR2Bucket({ accountId, apiToken, bucketName: PRIVATE_BUCKET_NAME }),
    IMOB_DATA: new RemoteR2Bucket({ accountId, apiToken, bucketName: DATA_BUCKET_NAME }),
  };

  const result = await publishReadModels(env);
  assertPipelineShape(result);

  log(
    `Publicação concluída — ${result.report.created} criado(s), ${result.report.updated} atualizado(s), ${result.report.unchanged} sem mudança, 0 excluído(s).`,
  );
  log("Nenhum deploy do Worker foi executado. Nenhum binding/DNS/secret foi alterado.");
  return result;
}

// --- CLI ---------------------------------------------------------------

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const confirmFlagIndex = rest.indexOf("--confirm");
  const confirmation = confirmFlagIndex >= 0 ? rest[confirmFlagIndex + 1] : undefined;

  if (mode === "validate") {
    await runValidate();
    return;
  }
  if (mode === "publish") {
    await runPublish({ confirmation });
    return;
  }
  console.error("Uso: node scripts/r2-read-models.js <validate|publish> [--confirm PUBLICAR_R2]");
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
