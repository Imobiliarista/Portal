// modules/feeds/generator.js
//
// Módulo feeds (§46) — o Publicador do "Modo Exportação": para cada
// submódulo registrado (modules/feeds/registry.js), recalcula o arquivo
// inteiro a partir do estado privado. Análogo a
// business/publishing.js#rebuildCity/rebuildAll (§33): sempre do zero,
// nunca incremental — o universo de "corretores que ligaram este
// submódulo" é normalmente um subconjunto pequeno de todos os
// corretores, então um recompute completo é barato o bastante para não
// justificar upsert incremental por anúncio (§9's particionamento de
// shard não existe aqui — um arquivo por submódulo, sem limite de
// tamanho, ver README#pendências).
//
// Este é o primeiro módulo desta etapa que toca R2/business diretamente
// no servidor — todos os módulos anteriores (publications, tour-360,
// video-youtube, comparison, financing-calculator, appointments) são
// client-side puros ou não têm nada para persistir. §39 permite essa
// direção (MODULES -> BUSINESS -> CORE -> STORAGE); o motivo é que
// nenhum módulo anterior precisava materializar um artefato que um
// consumidor fora do browser (o robô de um portal externo) busca direto,
// sem executar JavaScript algum — só um arquivo estático em R2 DATA
// resolve isso (§94, edge-first).
//
// Nunca chamado a cada write individual sem gate — ver worker/api.js e
// worker/admin.js (o gate: só quando o corretor afetado tem QUALQUER
// submódulo habilitado, `modules/feeds/config.js#hasAnyFeedSubmoduleEnabled`).
// Também exposto via scripts/rebuild-feeds.js para uso manual/cron
// externo (README#pendências — não há Cron Trigger da Cloudflare
// implementado neste lote, worker/cron.js continua placeholder).

import { getBrokerById } from "../../business/brokers.js";
import { getKnownBrokerIds, getBrokerListingIds } from "../../storage/indexes.js";
import { getPrivate } from "../../storage/private.js";
import { getPublic, putPublicText } from "../../storage/public.js";
import { privateKeys, dataKeys } from "../../storage/keys.js";
import { buildCacheControl } from "../../storage/cache.js";
import { readFeedSubmoduleConfig } from "./config.js";
import { FEED_SUBMODULES } from "./registry.js";

export class UnknownFeedSubmoduleError extends Error {
  constructor(submoduleId) {
    super(`Submódulo de exportação "${submoduleId}" não está registrado (modules/feeds/registry.js).`);
    this.name = "UnknownFeedSubmoduleError";
    this.submoduleId = submoduleId;
  }
}

/**
 * Enumerates every listing eligible for `submoduleId` right now: owned
 * by a corretor with `status: "active"` AND
 * `modules.feeds[submoduleId].enabled` (§46 decisão — opt-in por
 * submódulo), cuja projeção PÚBLICA tem `status: "active"` (§13/§14 —
 * mesma condição que já existe para um card existir num shard de
 * cidade, `cardActive` em business/publishing.js). Essa única condição
 * na projeção pública já exclui de graça os anúncios de um corretor
 * suspenso: business/publishing.js#publishListing já reescreve os
 * anúncios que seriam "active" de um corretor suspenso pra
 * `status: "suspended"` no momento da suspensão (Etapa 8a decisão 8) —
 * este gerador não precisa reimplementar essa cascata, só confia no
 * mesmo status público que o portal/minisite já confiam. O check
 * `broker.status === "active"` abaixo é defesa extra pro único buraco
 * dessa cascata hoje: `status: "disabled"` não tem ação de admin
 * associada ainda (business/brokers.js), então um corretor "disabled"
 * poderia em teoria ainda ter anúncios com `status: "active"` se
 * `republishBrokerListings` nunca tiver rodado — este gerador não confia
 * cegamente nisso.
 *
 * Usa só os registries/indexes que storage/indexes.js já mantém (§26
 * "não varrer objetos") — nenhum `list()` de bucket neste arquivo. Cada
 * item devolvido é `{ listing, listingId }` — `listingId` é o id PRIVADO
 * (business/listings.js), que `listing-public.schema.json` nunca carrega
 * (só `slug`) mas que formatters/vrsync.js precisa para `<ListingID>`
 * (decisão do solicitante: "ListingID = listingId interno").
 */
export async function collectFeedItems(env, submoduleId) {
  const brokerIds = await getKnownBrokerIds(env);
  const items = [];

  for (const brokerId of brokerIds) {
    const broker = await getBrokerById(env, brokerId);
    if (!broker || broker.status !== "active") continue;
    if (!readFeedSubmoduleConfig(broker, submoduleId).enabled) continue;

    const listingIds = await getBrokerListingIds(env, brokerId);
    for (const listingId of listingIds) {
      const manifest = await getPrivate(env, privateKeys.listingManifest(listingId));
      if (!manifest?.slug) continue; // nunca publicado, ou entrada de índice órfã

      const listingPublic = await getPublic(env, dataKeys.listingPublic(manifest.slug));
      if (!listingPublic || listingPublic.status !== "active") continue;

      items.push({ listing: listingPublic, listingId });
    }
  }

  return items;
}

/** `{provider, email, contactName, telephone, publishDate}` for the shared `<Header>` (VRSync) — see README#pendências for the contact fields' current placeholder status. */
export function buildFeedHeader(env) {
  return {
    provider: "Imobiliarista",
    email: env?.FEED_CONTACT_EMAIL ?? "contato@imobiliarista.net",
    contactName: "Imobiliarista",
    telephone: env?.FEED_CONTACT_PHONE ?? null,
    publishDate: new Date().toISOString(),
  };
}

/**
 * Rebuilds every registered submodule's file from scratch and writes
 * each to `feeds/{fileName}.xml` in R2 DATA (storage/keys.js#dataKeys.feed).
 * `submodules` defaults to every registered id
 * (modules/feeds/registry.js); pass an explicit subset to rebuild only
 * one (e.g. from a script). Returns `{ [submoduleId]: { candidateCount } }` —
 * `candidateCount` is the number of listings eligible *before* the
 * submodule's own `generate` applies its own field-level exclusions
 * (e.g. formatters/vrsync.js dropping an unmapped `type`/missing
 * `zipcode`); `generate` returns a plain string, not a count, so a
 * per-submodule "how many actually made it in" isn't available here
 * without re-parsing the output.
 */
export async function regenerateFeeds(env, { submodules, registry = FEED_SUBMODULES } = {}) {
  const submoduleIds = submodules ?? Object.keys(registry);
  const header = buildFeedHeader(env);

  const results = {};
  for (const submoduleId of submoduleIds) {
    const submodule = registry[submoduleId];
    if (!submodule) throw new UnknownFeedSubmoduleError(submoduleId);

    const items = await collectFeedItems(env, submoduleId);
    const content = submodule.generate(items, header);
    await putPublicText(env, dataKeys.feed(submodule.fileName), content, {
      contentType: submodule.contentType,
      cacheControl: buildCacheControl("feed"),
    });
    results[submoduleId] = { candidateCount: items.length };
  }
  return results;
}
