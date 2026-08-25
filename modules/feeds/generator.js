// modules/feeds/generator.js
//
// Módulo feeds (§46) — o Publicador deste módulo. Análogo a
// business/publishing.js#rebuildCity/rebuildAll (§33): recalcula do zero a
// partir do estado privado, nunca incremental — dado que o universo aqui é
// "corretores que optaram por aparecer no feed", que é sempre um
// subconjunto (normalmente pequeno) de todos os corretores, um recompute
// completo é barato o bastante para não justificar a complexidade de um
// upsert incremental por anúncio que rebuildCity precisa (§9's shard
// partitioning não existe aqui).
//
// Este é o primeiro módulo desta etapa que toca R2/business diretamente no
// servidor — todos os módulos anteriores (publications, tour-360,
// video-youtube, comparison, financing-calculator, appointments) são
// client-side puros ou não têm nada para persistir. §39 permite essa
// direção (MODULES -> BUSINESS -> CORE -> STORAGE); o motivo pelo qual os
// módulos anteriores nunca precisaram é que nenhum deles precisava
// materializar um artefato que um consumidor fora do browser (o robô do
// OLX/ZAP) busca direto, sem executar JavaScript algum — só um arquivo
// estático em R2 DATA resolve isso (§94, ver também a mensagem do
// solicitante reforçando "edge-first").
//
// Nunca chamado a cada write individual em worker/api.js/worker/admin.js —
// ver worker/api.js e worker/admin.js para onde e por que (gate: só quando
// o corretor afetado tem `modules.feeds.enabled`, para não pagar o custo
// de um recompute completo em toda edição de qualquer corretor, opt-in ou
// não). Também exposto via scripts/generate-feeds.js para uso manual/cron
// externo (README#pendências — não há Cron Trigger da Cloudflare
// implementado neste lote, worker/cron.js continua placeholder).

import { getBrokerById } from "../../business/brokers.js";
import { getCityBySlug } from "../../business/cities.js";
import { getKnownBrokerIds, getBrokerListingIds } from "../../storage/indexes.js";
import { getPrivate } from "../../storage/private.js";
import { getPublic, putPublicText } from "../../storage/public.js";
import { privateKeys, dataKeys } from "../../storage/keys.js";
import { buildCacheControl } from "../../storage/cache.js";
import { readFeedsConfig } from "./config.js";
import { FEED_FORMATTERS } from "./registry.js";

export class UnknownFeedPortalError extends Error {
  constructor(portalId) {
    super(`Portal de feed "${portalId}" não está registrado (modules/feeds/registry.js).`);
    this.name = "UnknownFeedPortalError";
    this.portalId = portalId;
  }
}

/**
 * Enumerates every listing eligible for the feed right now: owned by a
 * corretor with `status: "active"` AND `modules.feeds.enabled` (§46
 * decisão 2), whose PUBLIC projection has `status: "active"` (§13/§14 —
 * the same condition business/publishing.js already uses for a card to
 * exist in a city shard, `cardActive`). This one condition on the public
 * projection is what excludes a suspended corretor's listings too, for
 * free: business/publishing.js#publishListing already rewrites a
 * suspended corretor's would-be-active listings to public
 * `status: "suspended"` the moment the corretor is suspended (Etapa 8a
 * decisão 8) — so this generator never needs to re-derive that cascade
 * itself, it just trusts the same public status the portal/minisite
 * already trust. The `broker.status === "active"` check below is
 * defense-in-depth for the one gap in that cascade noted in
 * business/brokers.js: `status: "disabled"` has no admin action wired to
 * it yet, so a disabled corretor's public listings could in theory still
 * read `status: "active"` if `republishBrokerListings` was never re-run —
 * this generator does not take that on faith.
 *
 * Uses only the registries/indexes storage/indexes.js already maintains
 * (§26 "não varrer objetos") — no bucket `list()` anywhere in this file.
 */
export async function collectFeedItems(env) {
  const brokerIds = await getKnownBrokerIds(env);
  const items = [];

  for (const brokerId of brokerIds) {
    const broker = await getBrokerById(env, brokerId);
    if (!broker || broker.status !== "active") continue;
    if (!readFeedsConfig(broker).enabled) continue;

    const listingIds = await getBrokerListingIds(env, brokerId);
    for (const listingId of listingIds) {
      const manifest = await getPrivate(env, privateKeys.listingManifest(listingId));
      if (!manifest?.slug) continue; // never published, or an orphaned index entry

      const listingPublic = await getPublic(env, dataKeys.listingPublic(manifest.slug));
      if (!listingPublic || listingPublic.status !== "active") continue;

      const city = getCityBySlug(listingPublic.location.city);
      if (!city) continue; // defensivo — não deveria acontecer para um listing já publicado (publishListing exige requireCityBySlug)

      items.push({ listing: listingPublic, city });
    }
  }

  return items;
}

/** `{provider, email, contactName, telephone, publishDate}` for the feed-level `<Header>` (VRSync) — see README#pendências for the contact fields' current placeholder status. */
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
 * Rebuilds one or more portal feeds from scratch and writes each to
 * `feeds/{fileName}.xml` in R2 DATA (storage/keys.js#dataKeys.feed).
 * `portals` defaults to every registered formatter
 * (modules/feeds/registry.js); pass an explicit subset to rebuild only
 * one (e.g. from a script). Returns `{ [portalId]: { candidateCount } }` —
 * `candidateCount` is `items.length`, the listings eligible *before* each
 * portal's own formatter applies its own field-level exclusions (e.g.
 * formatters/olx.js dropping an unmapped `type`); formatters return a
 * plain XML string, not a count, so a per-portal "how many actually made
 * it in" isn't available here without re-parsing the XML.
 */
export async function regenerateFeeds(env, { portals, registry = FEED_FORMATTERS } = {}) {
  const portalIds = portals ?? Object.keys(registry);
  const items = await collectFeedItems(env);
  const header = buildFeedHeader(env);

  const results = {};
  for (const portalId of portalIds) {
    const formatter = registry[portalId];
    if (!formatter) throw new UnknownFeedPortalError(portalId);

    const xml = formatter.formatFeed(items, header);
    await putPublicText(env, dataKeys.feed(formatter.fileName), xml, {
      contentType: "application/xml; charset=utf-8",
      cacheControl: buildCacheControl("feed"),
    });
    results[portalId] = { candidateCount: items.length };
  }
  return results;
}
