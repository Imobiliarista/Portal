// business/r2ReadModelsAdapter.js
//
// Adapter oficial IMOB_PRIVATE -> IMOB_DATA (Etapa 4, missão "corrigir a
// falha de produção em que https://imobiliarista.net permanece eternamente
// em Carregando…"). Fonte: só IMOB_PRIVATE, sempre via os índices/registries
// já existentes (`storage/indexes.js#getKnownCitySlugs`/`getKnownBrokerIds`
// — nunca `list()`/varredura de bucket, §26). Destino: só IMOB_DATA, sempre
// através do publicador oficial (`business/publishing.js`) — este arquivo
// nunca importa `storage/private.js`/`storage/public.js` além de
// `getPublic` (leitura, para comparar o plano) e nunca chama
// `putPrivate`/`deletePrivate`/`deletePublic`.
//
// Pipeline: enumerate -> validate -> plan -> apply -> report (Etapa 4). As
// funções de planejamento (`planGlobalCatalogs`) só leem `env` (getPublic) e
// nunca escrevem — podem rodar inteiramente em memória contra um `env` de
// teste (mesmo `FakeR2Bucket` que `tests/publishing/publishing.test.js` já
// usa), sem credenciais nem acesso remoto algum (Etapa 5 "validate não pode
// abrir conexão remota").
//
// SEM delete em nenhuma função deste arquivo — nem `deletePublic`, nem
// `deletePrivate`, ESTRUTURALMENTE, não por sorte de estado. Nenhuma
// função exportada aqui chama uma dessas diretamente, e as duas funções
// reutilizadas de `business/publishing.js` que TÊM capacidade de exclusão
// só são chamadas daqui com essa capacidade explicitamente desligada (ver
// `reconcileKnownBrokersAndCities` abaixo):
//
//   - `rebuildCity` (por padrão apaga shard órfão de cidade que encolheu)
//     é chamada com `{ pruneOrphanShards: false }`.
//   - `republishBrokerListings` (que por baixo também recalcula
//     `brokers/{slug}/listings.json`/manifest+shards via
//     `publishBrokerListingsAggregate`, por padrão apagando o formato
//     antigo quando um corretor cruza a fronteira de 1 shard) é chamada
//     com `{ pruneObsoleteFormat: false }`.
//
// Sem qualquer um desses dois guards, reutilizar a função correspondente
// teria reintroduzido exatamente a exclusão que a Etapa 4 proíbe
// explicitamente para este adapter ("não apagar shards órfãos nesta
// primeira implementação protegida" / "não reutilize [a capacidade de
// exclusão] no adapter de publicação inicial"), apesar de `rebuildCity` e
// `republishBrokerListings`/`publishBrokerListingsAggregate` em si
// continuarem podando/trocando formato normalmente para quem os chama
// fora deste arquivo (`scripts/rebuild-city.js`, `rebuildAll`,
// `publishListing`). Nenhuma função exportada por este arquivo aceita ou
// expõe essa operação (Etapa 4 "não ofereça delete/remove/purge ou
// equivalente no adapter").

import { getKnownCitySlugs, getKnownBrokerIds } from "../storage/indexes.js";
import { getPublic } from "../storage/public.js";
import { dataKeys } from "../storage/keys.js";
import { buildCacheControl } from "../storage/cache.js";
import { getCityBySlug } from "./cities.js";
import { getBrokerById } from "./brokers.js";
import { buildPortalTaxonomy } from "./taxonomy.js";
import { buildPortalCitiesCatalog, buildPortalModulesCatalog } from "./catalogs.js";
import { resolveKnownCitiesForCatalog, rebuildBroker, republishBrokerListings, rebuildCity } from "./publishing.js";
import { putPublic } from "../storage/public.js";

// --- enumerate ---------------------------------------------------------

/**
 * Enumera os registros a publicar usando só índices/registries oficiais —
 * nunca varredura de bucket (§26, Etapa 4 requisito 5).
 */
export async function enumerate(env) {
  const citySlugs = await getKnownCitySlugs(env);
  const brokerIds = await getKnownBrokerIds(env);
  return { citySlugs, brokerIds };
}

// --- validate ------------------------------------------------------------

/**
 * Valida estruturalmente o que `enumerate` achou, ANTES de qualquer
 * escrita (Etapa 4 requisito 17 "falhar antes da primeira escrita quando
 * qualquer validação estrutural falhar" — aqui "falhar" é reportado, não
 * necessariamente fatal, ver comentário abaixo). Não substitui os
 * validadores do publicador em si (`assertValidListingPublic`/
 * `assertValidBrokerPublic`, que continuam rodando dentro de
 * `publishListing`/`publishBroker` quando `publishReadModels` chama
 * `republishBrokerListings`/`rebuildBroker`) — só garante que os
 * slugs/ids enumerados ainda resolvem contra as fontes autoritativas
 * (catálogo IBGE, perfil privado do corretor) antes do plano ser
 * construído sobre um registro que não existe mais.
 *
 * Um slug de cidade fora do catálogo IBGE ou um `brokerId` sem perfil
 * privado correspondente não é tratado como erro fatal (mesma filosofia
 * defensiva de `rebuildCity`: "não deixar um registro corrompido derrubar
 * o rebuild inteiro") — é reportado em `problems`/`unknownCitySlugs`/
 * `missingBrokerIds` e excluído da reconciliação, nunca silenciado.
 */
export async function validate(env, enumeration) {
  const problems = [];

  const unknownCitySlugs = enumeration.citySlugs.filter((slug) => !getCityBySlug(slug));
  if (unknownCitySlugs.length > 0) {
    problems.push(`cidade(s) fora do catálogo IBGE, ignoradas na publicação: ${unknownCitySlugs.join(", ")}`);
  }

  const missingBrokerIds = [];
  for (const brokerId of enumeration.brokerIds) {
    const broker = await getBrokerById(env, brokerId);
    if (!broker) missingBrokerIds.push(brokerId);
  }
  if (missingBrokerIds.length > 0) {
    problems.push(`brokerId(s) no registro sem perfil privado correspondente: ${missingBrokerIds.join(", ")}`);
  }

  return { valid: true, problems, unknownCitySlugs, missingBrokerIds };
}

// --- plan (catálogos globais — puro, em memória) ---------------------------

/**
 * Constrói, em memória, o conteúdo-alvo dos 3 catálogos globais e compara
 * contra o que já está publicado (Etapa 4 requisito 11 "produzir um plano
 * antes de escrever"). Só lê `env` (`getPublic`) — nunca escreve. Roda
 * inteiramente contra um `env` de teste (`FakeR2Bucket`), sem credenciais
 * nem rede real.
 */
export async function planGlobalCatalogs(env) {
  const { cities, skippedCitySlugs } = await resolveKnownCitiesForCatalog(env);

  const targets = [
    { key: dataKeys.portalCities(), nextValue: buildPortalCitiesCatalog(cities) },
    { key: dataKeys.portalTaxonomy(), nextValue: buildPortalTaxonomy() },
    { key: dataKeys.portalModules(), nextValue: buildPortalModulesCatalog() },
  ];

  const plannedTargets = [];
  for (const target of targets) {
    const currentValue = await getPublic(env, target.key);
    const unchanged = currentValue !== null && JSON.stringify(currentValue) === JSON.stringify(target.nextValue);
    plannedTargets.push({
      ...target,
      currentValue,
      action: unchanged ? "unchanged" : currentValue === null ? "create" : "update",
    });
  }

  return { targets: plannedTargets, skippedCitySlugs };
}

// --- apply -----------------------------------------------------------------

/**
 * Aplica um plano já construído (`planGlobalCatalogs`) — grava só as
 * chaves presentes nele (Etapa 4 "a aplicação deve escrever somente as
 * chaves presentes no plano validado"). `unchanged` nunca é regravado
 * (idempotência real: uma segunda execução sem mudança de estado privado
 * não produz nenhum PUT). Nenhuma chamada a delete em nenhum branch.
 */
export async function applyGlobalCatalogsPlan(env, plan) {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const target of plan.targets) {
    if (target.action === "unchanged") {
      unchanged += 1;
      continue;
    }
    await putPublic(env, target.key, target.nextValue, { cacheControl: buildCacheControl("portalCatalog") });
    if (target.action === "create") created += 1;
    else updated += 1;
  }

  return {
    planned: plan.targets.length,
    validated: plan.targets.length,
    created,
    updated,
    unchanged,
    ignored: 0,
    rejected: 0,
  };
}

// --- reconciliação de corretores/imóveis/cidades (reaproveita o publicador) -

/**
 * Republica cada corretor/imóvel conhecido e reconstrói cada cidade
 * conhecida, reaproveitando por completo o publicador já testado
 * (`rebuildBroker`/`republishBrokerListings`/`rebuildCity` —
 * `business/publishing.js`, Etapa 6) em vez de duplicar essa lógica aqui
 * (Etapa 4 requisito 7 "reutilizar o publicador oficial existente"). Roda
 * ANTES do plano dos 3 catálogos globais, para que `totalListings` em
 * `portal/cities.json` reflita o estado privado atual mesmo numa primeira
 * publicação em que nenhum `publishListing` incremental tenha rodado
 * ainda.
 *
 * `brokerId`s reportados como órfãos por `validate` (sem perfil privado) e
 * slugs de cidade fora do catálogo IBGE (`validation.unknownCitySlugs`) são
 * pulados — não há o que republicar/reconstruir, e chamar `rebuildCity`
 * para um slug desconhecido lançaria `UnknownCityError` e derrubaria a
 * publicação inteira, o que a filosofia defensiva deste adapter existe
 * para evitar.
 *
 * Usa `rebuildCity` cidade a cidade em vez do `rebuildAll` checkpointado
 * (`business/publishing.js`, §34) de propósito: o checkpoint em lotes
 * existe para sobreviver a execuções curtas de Worker — este adapter roda
 * como script Node de vida longa (Etapa 5), então um laço simples sobre
 * todas as cidades válidas já é, na prática, "um lote só", sem precisar do
 * mecanismo de retomada.
 *
 * **Sempre com `{ pruneOrphanShards: false }`** (Etapa 4 "não apagar
 * shards órfãos nesta primeira implementação protegida" /
 * "não reutilize [a capacidade de exclusão] no adapter de publicação
 * inicial"): `rebuildCity` por padrão apaga arquivos de shard que
 * sobraram de uma cidade que encolheu (`deletePublic`, ver seu próprio
 * cabeçalho em business/publishing.js) — comportamento correto para o
 * caminho normal de reconstrução manual (`npm run rebuild:city`), mas
 * proibido explicitamente aqui. Sem essa flag, este adapter poderia
 * disparar uma exclusão real de R2 durante uma publicação comum, apesar
 * do cabeçalho deste arquivo dizer "sem delete" — exatamente o que essa
 * flag existe para impedir estruturalmente, não por sorte de estado.
 *
 * Mesmo raciocínio, mesma exigência estrutural para
 * `republishBrokerListings`: **sempre com `{ pruneObsoleteFormat: false
 * }`**. Por baixo, `republishBrokerListings` agora também recalcula o
 * agregado de listagens do corretor (`publishBrokerListingsAggregate`),
 * que por padrão apaga o formato antigo (arquivo único vs.
 * manifest+shards) quando o corretor cruza a fronteira de 1 shard desde
 * a última reconciliação — sem esta flag, este adapter poderia disparar
 * essa mesma exclusão real de R2 pelo mesmo motivo do `rebuildCity`
 * acima.
 */
export async function reconcileKnownBrokersAndCities(env, enumeration, validation) {
  const brokerResults = [];
  for (const brokerId of enumeration.brokerIds) {
    if (validation.missingBrokerIds.includes(brokerId)) continue;
    const profile = await rebuildBroker(env, brokerId);
    const listings = await republishBrokerListings(env, brokerId, { pruneObsoleteFormat: false });
    brokerResults.push({ brokerId, profile, listingsRepublished: listings.length });
  }

  const validCitySlugs = enumeration.citySlugs.filter((slug) => !validation.unknownCitySlugs.includes(slug));
  for (const citySlug of validCitySlugs) {
    await rebuildCity(env, citySlug, { pruneOrphanShards: false });
  }

  return {
    brokersProcessed: brokerResults.length,
    brokerResults,
    citiesProcessed: validCitySlugs.length,
    totalCities: enumeration.citySlugs.length,
  };
}

// --- orquestração completa --------------------------------------------

/**
 * Pipeline completo (Etapa 4/§31): enumerate -> validate ->
 * (reconciliar corretores/imóveis/cidades) -> plan -> apply -> report.
 * `reconcileBrokersAndCities: false` roda só o plano/apply dos 3 catálogos
 * globais — usado pelo modo `validate` do executor (Etapa 5), que nunca
 * escreve nada de verdade (chamador passa um `env` de teste).
 */
export async function publishReadModels(env, { reconcileBrokersAndCities = true } = {}) {
  const enumeration = await enumerate(env);
  const validation = await validate(env, enumeration);

  const reconciliation = reconcileBrokersAndCities
    ? await reconcileKnownBrokersAndCities(env, enumeration, validation)
    : null;

  const plan = await planGlobalCatalogs(env);
  const report = await applyGlobalCatalogsPlan(env, plan);

  return {
    enumeration,
    validation,
    reconciliation,
    plan: {
      targets: plan.targets.map((target) => ({ key: target.key, action: target.action })),
      skippedCitySlugs: plan.skippedCitySlugs,
    },
    report,
  };
}
