// business/publishing.js
//
// O Publicador (§31, Etapa 6 — §90): a ponte entre o estado privado
// (business/listings.js, business/brokers.js — Lote 3) e as projeções
// públicas em R2 DATA que frontend/portal e frontend/minisite (Lote 2) já
// sabem ler. Nada aqui é chamado pelo Browser — só pelo Worker (via
// worker/api.js, no save/edit do painel) e pelos scripts de rebuild
// (scripts/rebuild-*.js).
//
// Decisões desta etapa (ver também o PR):
//
// 1. Mapeamento de status. O draft do anúncio tem 5 estados
//    (draft/active/paused/sold/removed, business/listings.js) e o
//    listing-public.schema.json tem outros 5, só 3 em comum
//    (active/sold/removed). O mapeamento abaixo (LISTING_STATUS_TO_PUBLIC)
//    é a única correspondência não-arbitrária dado os enums de cada lado:
//    "paused" -> "inactive" (só estado "pausado" que o schema público tem),
//    "draft" -> null (ainda não publicado — é literalmente o que "draft"
//    significa). Mesma lógica para corretor (BROKER_STATUS_TO_PUBLIC):
//    "pending" -> null (não aprovado, sem minisite ainda), "disabled" ->
//    "suspended" (broker-public.schema.json não tem estado "disabled").
//
// 2. Card só existe para anúncio com status público "active" (§13/§14 — o
//    card não tem campo "status" nenhum, é implicitamente sempre ativo).
//    "inactive"/"sold"/"removed" saem do shard/index mas o
//    listings/{slug}.json completo continua existindo com o status
//    explícito (§64) — nunca 404 silencioso.
//
// 3. Caso de borda não coberto pelo documento: anúncio que já foi
//    publicado e volta para "draft" (tecnicamente permitido por
//    business/listings.js#updateListing, que não restringe transições de
//    status). Decisão conservadora: o card sai do shard/index (deixa de
//    contar como "ativo"), mas listings/{slug}.json NÃO é sobrescrito —
//    fica com o último status público explícito conhecido, já que
//    listing-public.schema.json não tem um valor "draft" válido para
//    representar esse estado. Ver pendências no PR.
//
// 4. Shard único por cidade. Esta etapa assume 1 shard (001.json) por
//    cidade — particionamento por 300 cards/1MB é Etapa 7 (§90). A
//    estrutura (manifest.shards como array, dataKeys.cityShard(slug, N))
//    já é compatível com múltiplos shards no futuro.
//
// 5. city.name/city.uf (exigidos por city-manifest.schema.json) vêm de
//    business/cities.js, catálogo estático gerado a partir do IBGE — ver o
//    cabeçalho daquele módulo. Cidade fora do catálogo é erro explícito
//    (UnknownCityError), nunca um name/uf inventado.
//
// 6. Jobs/Queue (§35-36): execução síncrona/direta. Não há sinal de volume
//    que justifique Queue (§94) — a única fila real é o cursor de
//    `rebuildAll` (§34), persistido em R2 PRIVATE (`jobs/rebuild-all/
//    checkpoint.json`), não uma Cloudflare Queue.
//
// 7. Gap encontrado (não uma decisão desta etapa, mas descoberto por ela):
//    business/listings.js não exige `district` na criação do anúncio, mas
//    listing-public.schema.json exige `location.district` (minLength 1).
//    O publicador recusa publicar nesse caso (`PublishValidationError`) em
//    vez de gravar um district vazio — ver pendências no PR.

import { getListingById, ListingNotFoundError } from "./listings.js";
import { getBrokerById, BrokerNotFoundError } from "./brokers.js";
import { requireCityBySlug } from "./cities.js";
import { buildListingCard, buildIndexEntry } from "./cards.js";
import { getPrivate, putPrivate, deletePrivate } from "../storage/private.js";
import { getPublic, putPublic } from "../storage/public.js";
import { privateKeys, dataKeys, MAX_CARDS_PER_SHARD, REBUILD_BATCH_SIZE } from "../storage/keys.js";
import { buildCacheControl } from "../storage/cache.js";
import {
  getCityListingIds,
  addCityListingId,
  removeCityListingId,
  getKnownCitySlugs,
  registerCitySlug,
} from "../storage/indexes.js";

export { ListingNotFoundError, BrokerNotFoundError };

export class PublishValidationError extends Error {
  constructor(label, problems) {
    super(`${label}: campo(s) obrigatório(s) ausente(s) ou inválido(s) — ${problems.join(", ")}`);
    this.name = "PublishValidationError";
    this.label = label;
    this.problems = problems;
  }
}

// --- mapeamento de status (decisão 1 acima) --------------------------------

const LISTING_STATUS_TO_PUBLIC = Object.freeze({
  draft: null,
  active: "active",
  paused: "inactive",
  sold: "sold",
  removed: "removed",
});

const BROKER_STATUS_TO_PUBLIC = Object.freeze({
  pending: null,
  active: "active",
  suspended: "suspended",
  disabled: "suspended",
});

export function mapListingStatusForPublic(status) {
  return LISTING_STATUS_TO_PUBLIC[status] ?? null;
}

export function mapBrokerStatusForPublic(status) {
  return BROKER_STATUS_TO_PUBLIC[status] ?? null;
}

// --- normalização (draft privado -> projeção pública) ----------------------

/** listing-draft.schema.json (+ broker) -> listing-public.schema.json (§15). */
export function normalizeListingForPublic(draft, status, broker, publicationVersion) {
  const location = {
    city: draft.city,
    district: draft.district ?? "",
  };
  if (draft.latitude !== undefined && draft.latitude !== null) location.latitude = draft.latitude;
  if (draft.longitude !== undefined && draft.longitude !== null) location.longitude = draft.longitude;

  return {
    schemaVersion: 1,
    publicationVersion,
    slug: draft.slug,
    status,
    title: draft.title,
    description: draft.description ?? "",
    purpose: draft.purpose,
    type: draft.type,
    price: draft.price,
    condominium: draft.condominium ?? null,
    iptu: draft.iptu ?? null,
    location,
    features: { ...draft.features },
    gallery: draft.gallery ?? [],
    video: draft.video ?? null,
    tour360: draft.tour360 ?? null,
    broker: { slug: broker.slug, name: broker.name },
  };
}

/** broker.schema.json -> broker-public.schema.json (§16). */
export function normalizeBrokerForPublic(broker, status) {
  return {
    schemaVersion: 1,
    slug: broker.slug,
    status,
    name: broker.name,
    ...(broker.creci !== undefined ? { creciPublic: broker.creci } : {}),
    ...(broker.phone !== undefined ? { phone: broker.phone } : {}),
    ...(broker.whatsapp !== undefined ? { whatsapp: broker.whatsapp } : {}),
    ...(broker.city !== undefined ? { city: broker.city } : {}),
    ...(broker.about !== undefined ? { about: broker.about } : {}),
    ...(broker.logo !== undefined ? { logo: broker.logo } : {}),
    ...(broker.cover !== undefined ? { cover: broker.cover } : {}),
    ...(broker.modules !== undefined ? { modules: broker.modules } : {}),
  };
}

// --- validação estrutural leve (§94 — sem ajv; ver decisão 7 acima) --------
// Checa presença dos campos obrigatórios de cada schema (mantidos em sincronia
// à mão com schemas/*.schema.json#required, mesmo padrão já usado por
// frontend/portal/data.js para os paths de storage/keys.js) mais o único gap
// estrutural real encontrado nesta etapa (district vazio). Não é um
// substituto para `npm run validate:schemas` nem para um validador de JSON
// Schema completo — só a rede de segurança do publicador antes de gravar.

const REQUIRED_LISTING_PUBLIC_FIELDS = [
  "schemaVersion",
  "publicationVersion",
  "slug",
  "status",
  "title",
  "description",
  "purpose",
  "type",
  "price",
  "location",
  "features",
  "gallery",
  "broker",
];

const REQUIRED_CARD_FIELDS = [
  "id",
  "slug",
  "title",
  "purpose",
  "type",
  "price",
  "district",
  "bedrooms",
  "bathrooms",
  "parkingSpaces",
  "area",
  "brokerSlug",
  "featured",
  "priority",
];

const REQUIRED_BROKER_PUBLIC_FIELDS = ["schemaVersion", "slug", "status", "name"];

function assertPresent(label, value, requiredFields) {
  const missing = requiredFields.filter((field) => value?.[field] === undefined);
  if (missing.length > 0) {
    throw new PublishValidationError(label, missing);
  }
}

function assertValidListingPublic(listingPublic) {
  assertPresent("listing-public", listingPublic, REQUIRED_LISTING_PUBLIC_FIELDS);
  assertPresent("listing-public.location", listingPublic.location, ["city", "district"]);
  assertPresent("listing-public.features", listingPublic.features, ["bedrooms", "bathrooms", "parkingSpaces", "area"]);
  assertPresent("listing-public.broker", listingPublic.broker, ["slug", "name"]);
  if (listingPublic.location.district === "") {
    throw new PublishValidationError("listing-public.location", ["district (vazio)"]);
  }
}

function assertValidCard(card) {
  assertPresent("city-shard card", card, REQUIRED_CARD_FIELDS);
}

function assertValidBrokerPublic(brokerPublic) {
  assertPresent("broker-public", brokerPublic, REQUIRED_BROKER_PUBLIC_FIELDS);
}

// --- shard/index/manifest de cidade (shard único — decisão 4 acima) -------

async function touchCityManifest(env, citySlug, totalListings, cityRef) {
  const manifestKey = dataKeys.cityManifest(citySlug);
  const existing = await getPublic(env, manifestKey);
  const manifest = {
    schemaVersion: 1,
    city: { slug: citySlug, name: cityRef.name, uf: cityRef.uf },
    publicationVersion: (existing?.publicationVersion ?? 0) + 1,
    totalListings,
    pageSize: MAX_CARDS_PER_SHARD,
    shards: totalListings > 0 ? ["001.json"] : [],
    lastUpdated: new Date().toISOString(),
  };
  await putPublic(env, manifestKey, manifest, { cacheControl: buildCacheControl("cityManifest") });
  return manifest;
}

/** Upserts (card != null) or removes (card == null) one listing's card in a city's single shard + index, then bumps the city manifest. */
async function applyCardToCity(env, citySlug, listingId, card, cityRef) {
  const shardKey = dataKeys.cityShard(citySlug, 1);
  const shard = (await getPublic(env, shardKey)) ?? [];
  const nextShard = shard.filter((existingCard) => existingCard.id !== listingId);
  if (card) nextShard.push(card);
  await putPublic(env, shardKey, nextShard, { cacheControl: buildCacheControl("cityShard") });

  const indexKey = dataKeys.cityIndex(citySlug);
  const index = (await getPublic(env, indexKey)) ?? [];
  const nextIndex = index.filter((entry) => entry.id !== listingId);
  if (card) nextIndex.push(buildIndexEntry(card, 1));
  await putPublic(env, indexKey, nextIndex, { cacheControl: buildCacheControl("cityIndex") });

  return touchCityManifest(env, citySlug, nextShard.length, cityRef);
}

// --- publicação incremental (§32) ------------------------------------------

/**
 * Publica (ou atualiza a publicação de) um anúncio a partir do seu draft
 * privado (§31-32). Gatilho: chamado pelo Worker toda vez que o corretor
 * salva/edita um anúncio (worker/api.js), ou explicitamente por
 * `rebuildListing`/scripts/rebuild-listing.js.
 *
 * Sempre grava/atualiza SÓ o shard da cidade atual do anúncio (nunca a
 * cidade inteira — isso é `rebuildCity`). Se a cidade mudou desde a última
 * publicação, também remove o card da cidade antiga.
 */
export async function publishListing(env, listingId) {
  const draft = await getListingById(env, listingId);
  if (!draft) throw new ListingNotFoundError(listingId);

  const manifestKey = privateKeys.listingManifest(listingId);
  const manifest = (await getPrivate(env, manifestKey)) ?? {};

  const status = mapListingStatusForPublic(draft.status);
  const everPublished = Boolean(manifest.publicationVersion);

  // Nothing to do unless this listing either goes/stays "active" (creates
  // or keeps its public footprint) or already HAD one (`everPublished`) —
  // e.g. a draft that jumps straight to "removed"/"sold" without ever
  // having been active never had a public URL to preserve, so there is no
  // tombstone to write (§64 exists to protect links that were actually
  // handed out, not to fabricate one for a listing the public never saw).
  const shouldPublish = status === "active" || everPublished;
  if (!shouldPublish) {
    return { published: false, reason: status === null ? "draft" : "never-published" };
  }

  const broker = await getBrokerById(env, draft.brokerId);
  if (!broker) throw new BrokerNotFoundError(draft.brokerId);
  await publishBroker(env, draft.brokerId);

  const cityRef = requireCityBySlug(draft.city);

  let listingPublic;
  let publicationVersion = manifest.publicationVersion ?? 0;

  if (status !== null) {
    publicationVersion += 1;
    listingPublic = normalizeListingForPublic(draft, status, broker, publicationVersion);
    assertValidListingPublic(listingPublic);
    await putPublic(env, dataKeys.listingPublic(draft.slug), listingPublic, {
      cacheControl: buildCacheControl("listingPublic"),
    });
  } else {
    // Regrediu para "draft" depois de já ter sido publicado (decisão 3 no
    // cabeçalho): deixa o listing completo como estava, só tira o card.
    listingPublic = await getPublic(env, dataKeys.listingPublic(draft.slug));
  }

  const cardActive = status === "active";
  let card = null;
  if (cardActive) {
    card = buildListingCard(listingId, listingPublic);
    assertValidCard(card);
  }

  const previousCity = manifest.publishedCity;
  if (previousCity && previousCity !== draft.city) {
    await applyCardToCity(env, previousCity, listingId, null, requireCityBySlug(previousCity));
    await removeCityListingId(env, previousCity, listingId);
  }

  await applyCardToCity(env, draft.city, listingId, card, cityRef);
  await addCityListingId(env, draft.city, listingId);
  await registerCitySlug(env, draft.city);

  await putPrivate(env, manifestKey, {
    ...manifest,
    listingId,
    brokerId: draft.brokerId,
    slug: draft.slug,
    city: draft.city,
    status: draft.status,
    draftKey: privateKeys.listingDraft(listingId),
    publicKey: dataKeys.listingPublic(draft.slug),
    publicationVersion,
    publishedCity: draft.city,
    lastPublishedAt: new Date().toISOString(),
  });

  return { published: true, listingPublic, cardActive, city: draft.city };
}

/**
 * Publica (ou atualiza) o perfil público de um corretor a partir do
 * perfil privado (§16), se ainda não existir ou estiver desatualizado
 * (comparando `broker.updatedAt` contra o que foi publicado por último).
 * `force: true` ignora essa checagem de staleness — usado por
 * `rebuildBroker`.
 */
export async function publishBroker(env, brokerId, { force = false } = {}) {
  const broker = await getBrokerById(env, brokerId);
  if (!broker) throw new BrokerNotFoundError(brokerId);

  const manifestKey = privateKeys.brokerManifest(brokerId);
  const manifest = (await getPrivate(env, manifestKey)) ?? {};

  const status = mapBrokerStatusForPublic(broker.status);
  if (status === null) {
    return { published: false, reason: "pending" };
  }
  if (!force && manifest.publishedProfileUpdatedAt === broker.updatedAt) {
    return { published: false, reason: "up-to-date" };
  }

  const brokerPublic = normalizeBrokerForPublic(broker, status);
  assertValidBrokerPublic(brokerPublic);
  await putPublic(env, dataKeys.brokerProfilePublic(broker.slug), brokerPublic, {
    cacheControl: buildCacheControl("brokerProfile"),
  });

  await putPrivate(env, manifestKey, {
    ...manifest,
    brokerId,
    userId: broker.userId,
    slug: broker.slug,
    status: broker.status,
    plan: broker.plan,
    profileKey: privateKeys.brokerProfileDraft(brokerId),
    publicationVersion: (manifest.publicationVersion ?? 0) + 1,
    publishedProfileUpdatedAt: broker.updatedAt,
  });

  return { published: true, brokerPublic };
}

// --- rebuild (§33) -----------------------------------------------------

/**
 * Reconstrói a publicação de um único anúncio a partir do draft privado.
 * Na granularidade de um único anúncio isso é exatamente o que
 * `publishListing` já faz — mantido como export próprio porque
 * scripts/rebuild-listing.js e um futuro "republicar imóvel" de SuperAdmin
 * (§53) não deveriam precisar saber disso.
 */
export async function rebuildListing(env, listingId) {
  return publishListing(env, listingId);
}

/** Reconstrói o perfil público de um corretor, ignorando a checagem de staleness. */
export async function rebuildBroker(env, brokerId) {
  return publishBroker(env, brokerId, { force: true });
}

/**
 * Reconstrói o manifest + shard(s) + index de UMA cidade inteira a partir
 * do estado privado (§33) — usa o índice cidade->listingIds
 * (storage/indexes.js) para achar todos os anúncios já publicados sob essa
 * cidade, sem varrer `listings/` (§26). Ao contrário de `publishListing`,
 * que faz upsert incremental, isto descarta e regera o shard/index inteiros
 * — use para corrigir divergência, nunca como caminho normal de uma edição
 * pequena (§33 "nunca reconstruir tudo por pequena alteração").
 */
export async function rebuildCity(env, citySlug) {
  const cityRef = requireCityBySlug(citySlug);
  const listingIds = await getCityListingIds(env, citySlug);

  const cards = [];
  for (const listingId of listingIds) {
    const draft = await getListingById(env, listingId);
    if (!draft) continue; // entrada de índice órfã — draft não existe mais

    const status = mapListingStatusForPublic(draft.status);
    if (status !== "active") continue;

    const broker = await getBrokerById(env, draft.brokerId);
    if (!broker) continue; // defensivo — não deixa um registro corrompido derrubar o rebuild inteiro

    const listingManifest = (await getPrivate(env, privateKeys.listingManifest(listingId))) ?? {};
    const publicationVersion = listingManifest.publicationVersion || 1;
    const listingPublic = normalizeListingForPublic(draft, status, broker, publicationVersion);
    cards.push(buildListingCard(listingId, listingPublic));
  }

  if (cards.length > MAX_CARDS_PER_SHARD) {
    // eslint-disable-next-line no-console
    console.warn(
      `business/publishing: cidade "${citySlug}" tem ${cards.length} cards ativos, acima do limite de ${MAX_CARDS_PER_SHARD} por shard (§9). Particionamento em múltiplos shards é Etapa 7 — gravando tudo em 001.json por ora.`,
    );
  }

  await putPublic(env, dataKeys.cityShard(citySlug, 1), cards, { cacheControl: buildCacheControl("cityShard") });

  const indexEntries = cards.map((card) => buildIndexEntry(card, 1));
  await putPublic(env, dataKeys.cityIndex(citySlug), indexEntries, { cacheControl: buildCacheControl("cityIndex") });

  return touchCityManifest(env, citySlug, cards.length, cityRef);
}

// --- rebuild em lote (§34) --------------------------------------------

/**
 * Reconstrói várias/todas as cidades, processadas em lotes checkpointáveis
 * (§34) — nunca todas de uma vez numa execução curta de Worker. Uma
 * chamada processa até `batchSize` cidades (aproximação desta etapa para
 * "100 shards por lote", §34: com shard único por cidade — decisão 4 —,
 * cidade e shard coincidem 1:1 por ora) a partir do registro de cidades
 * conhecidas (storage/indexes.js#getKnownCitySlugs), grava um checkpoint
 * em R2 PRIVATE (`jobs/rebuild-all/checkpoint.json`) e retorna
 * `{ done: false, nextCursor }` se sobrar trabalho — o chamador (script ou
 * uma futura rota de SuperAdmin) invoca de novo para continuar. Idempotente:
 * `rebuildCity` sempre recalcula do zero a partir do estado privado.
 */
export async function rebuildAll(env, { batchSize = REBUILD_BATCH_SIZE, cursor } = {}) {
  const citySlugs = await getKnownCitySlugs(env);
  const checkpointKey = privateKeys.job("rebuild-all", "checkpoint");
  const startCursor = cursor ?? (await getPrivate(env, checkpointKey))?.cursor ?? 0;

  const batch = citySlugs.slice(startCursor, startCursor + batchSize);
  for (const citySlug of batch) {
    await rebuildCity(env, citySlug);
  }

  const nextCursor = startCursor + batch.length;
  const done = nextCursor >= citySlugs.length;

  if (done) {
    await deletePrivate(env, checkpointKey);
  } else {
    await putPrivate(env, checkpointKey, {
      cursor: nextCursor,
      totalCities: citySlugs.length,
      updatedAt: new Date().toISOString(),
    });
  }

  return { processedCities: batch, nextCursor, totalCities: citySlugs.length, done };
}
