// modules/saved-search/service.js
//
// Busca salva por e-mail (§43, Etapa 9 — módulo saved-search). §43 é só a
// árvore de arquivos (index.js, service.js, notifications.js, README.md) —
// sem uma linha sobre o fluxo em si. Confirmado com o solicitante antes de
// qualquer código (ver README.md#decisões):
//
// 1. Quem salva: visitante público do portal, sem login/sessão — nenhum
//    brokerId/tenant envolvido. O registro vive numa gaveta nova em R2
//    PRIVATE (`saved-searches/`, storage/keys.js#privateKeys.savedSearch),
//    endereçada só pelo próprio id, nunca por corretor.
// 2. Anti-abuso: double opt-in por e-mail (nada é ativado — nenhum e-mail
//    de alerta pode ser enviado — antes do clique de confirmação) + um
//    limite simples por IP/dia, contado num objeto em R2 PRIVATE (não há
//    KV/D1/Durable Objects neste projeto — ver wrangler.toml).
// 3. Notificação: chamada direto do fluxo de publicação (mesmo hook que
//    worker/api.js já usa para modules/feeds#regenerateFeeds), não um
//    cron novo — ver `checkSavedSearchesForListing` abaixo e o header de
//    modules/saved-search/index.js.
//
// Este é o segundo módulo desta etapa (depois de modules/feeds) a tocar
// R2/business direto no Worker — §39 permite essa direção (MODULES ->
// BUSINESS -> CORE -> STORAGE).
//
// Tokens de confirmação/cancelamento são auto-contidos e assinados
// (`core/session.js#createSessionToken`/`verifySessionToken` — a mesma
// primitiva HMAC genérica de claims+exp que já assina o cookie de sessão,
// aqui reaproveitada com um secret PRÓPRIO, SAVED_SEARCH_TOKEN_SECRET,
// nunca SESSION_SECRET). Isso evita uma segunda tabela de índice só para
// resolver "token -> savedSearchId": o token já carrega o id, a
// assinatura garante que não foi forjado, e o registro em si continua
// endereçável por chave determinística (§26 "não varrer objetos").

import { getPrivate, putPrivate } from "../../storage/private.js";
import { privateKeys } from "../../storage/keys.js";
import {
  getSavedSearchIdsForCity,
  addSavedSearchToCityIndex,
  removeSavedSearchFromCityIndex,
  hmacSha256Hex,
} from "../../storage/indexes.js";
import { getCityBySlug } from "../../business/cities.js";
import {
  isEmail,
  isNonEmptyString,
  isSlug,
  isInteger,
  isPositiveNumber,
  isEnum,
  pickAllowed,
  validate,
  ValidationError,
} from "../../core/validation.js";
import { createSessionToken, verifySessionToken } from "../../core/session.js";
import { createLogger } from "../../core/logger.js";
import { sendConfirmationEmail, sendMatchNotificationEmail } from "./notifications.js";

const logger = createLogger("modules.saved-search");

const RATE_LIMIT_MAX_PER_IP_PER_DAY = 5;
const CONFIRM_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias
// Sem expiração real de produto para um link de descadastro — um TTL de
// anos é, na prática, "não expira", sem precisar de um caminho de código
// separado (sem exp) na primitiva de token que já reaproveitamos.
const UNSUBSCRIBE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365 * 10; // ~10 anos

const CRITERIA_ALLOWED_KEYS = [
  "city",
  "purpose",
  "type",
  "district",
  "priceMin",
  "priceMax",
  "bedroomsMin",
  "bathroomsMin",
  "parkingSpacesMin",
  "areaMin",
];
const PURPOSE_VALUES = ["venda", "aluguel"];

export class SavedSearchRateLimitedError extends Error {
  constructor() {
    super("Muitas solicitações a partir deste endereço. Tente novamente mais tarde.");
    this.name = "SavedSearchRateLimitedError";
  }
}

export class InvalidSavedSearchTokenError extends Error {
  constructor() {
    super("Link inválido ou expirado.");
    this.name = "InvalidSavedSearchTokenError";
  }
}

function tokenSecret(env) {
  if (!env?.SAVED_SEARCH_TOKEN_SECRET) {
    throw new Error("modules/saved-search: binding SAVED_SEARCH_TOKEN_SECRET ausente em env.");
  }
  return env.SAVED_SEARCH_TOKEN_SECRET;
}

async function issueToken(env, purpose, savedSearchId, ttlSeconds) {
  return createSessionToken({ purpose, savedSearchId }, tokenSecret(env), { ttlSeconds });
}

async function verifyToken(env, token, expectedPurpose) {
  const claims = await verifySessionToken(token, tokenSecret(env));
  if (!claims || claims.purpose !== expectedPurpose || typeof claims.savedSearchId !== "string") {
    return null;
  }
  return claims;
}

// --- anti-abuso: limite por IP/dia (decisão 2) -----------------------------
// Best-effort: R2 não tem PUT condicional/transação aqui, então uma corrida
// entre duas requisições da mesma origem no mesmo instante pode subcontar
// em 1 — aceitável para um limite de dissuasão, não uma garantia dura
// (ver README#pendências).

async function enforceRateLimit(env, ip) {
  if (!ip) return; // sem IP disponível (ex. dev local) — nada para chavear o limite
  const dateStamp = new Date().toISOString().slice(0, 10);
  const ipHash = await hmacSha256Hex(`saved-search-ip:${ip}`, tokenSecret(env));
  const key = privateKeys.savedSearchRateLimit(ipHash, dateStamp);
  const counter = await getPrivate(env, key);
  const count = counter?.count ?? 0;
  if (count >= RATE_LIMIT_MAX_PER_IP_PER_DAY) {
    throw new SavedSearchRateLimitedError();
  }
  await putPrivate(env, key, { count: count + 1 });
}

// --- validação de critério (allowlist, §78) --------------------------------

function validateCriteria(rawCriteria) {
  const picked = pickAllowed(rawCriteria, CRITERIA_ALLOWED_KEYS);
  const result = validate(
    picked,
    {
      city: (value) => isSlug(value) && Boolean(getCityBySlug(value)),
      purpose: (value) => isEnum(value, PURPOSE_VALUES),
      type: (value) => isNonEmptyString(value, { maxLength: 60 }),
      district: (value) => isNonEmptyString(value, { maxLength: 120 }),
      priceMin: isPositiveNumber,
      priceMax: isPositiveNumber,
      bedroomsMin: isInteger,
      bathroomsMin: isInteger,
      parkingSpacesMin: isInteger,
      areaMin: isPositiveNumber,
    },
    { required: ["city"] },
  );
  return { picked, result };
}

// --- criação (POST /api/saved-searches) ------------------------------------

/**
 * Cria um registro "pending" e dispara o e-mail de confirmação. Nunca lança
 * por causa de falha no envio do e-mail em si (best-effort, só logado) —
 * o registro fica salvo mesmo assim; sem uma rota de reenvio neste lote
 * (README#pendências).
 */
export async function createSavedSearch(env, input, { ip, requestOrigin }) {
  await enforceRateLimit(env, ip);

  const picked = pickAllowed(input, ["email", "criteria"]);
  const { picked: criteria, result } = validateCriteria(picked.criteria);
  const errors = [...result.errors];
  if (!isEmail(picked.email)) {
    errors.push({ field: "email", message: "e-mail inválido" });
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  const savedSearchId = `savedsearch_${crypto.randomUUID()}`;
  const record = {
    id: savedSearchId,
    status: "pending",
    email: picked.email.trim().toLowerCase(),
    criteria,
    notifiedListingSlugs: [],
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    unsubscribedAt: null,
  };
  await putPrivate(env, privateKeys.savedSearch(savedSearchId), record);

  const confirmToken = await issueToken(env, "confirm", savedSearchId, CONFIRM_TOKEN_TTL_SECONDS);
  const confirmUrl = `${requestOrigin}/api/saved-searches/confirm?token=${encodeURIComponent(confirmToken)}`;
  try {
    await sendConfirmationEmail(env, { to: record.email, confirmUrl });
  } catch (error) {
    logger.error("confirmation_email_failed", { savedSearchId, message: error?.message });
  }

  return { status: "pending_confirmation" };
}

// --- confirmação (GET /api/saved-searches/confirm) -------------------------

export async function confirmSavedSearch(env, token) {
  const claims = await verifyToken(env, token, "confirm");
  if (!claims) throw new InvalidSavedSearchTokenError();

  const record = await getPrivate(env, privateKeys.savedSearch(claims.savedSearchId));
  if (!record) throw new InvalidSavedSearchTokenError();

  if (record.status === "unsubscribed") return { record, alreadyUnsubscribed: true };
  if (record.status === "confirmed") return { record, alreadyConfirmed: true };

  const confirmed = { ...record, status: "confirmed", confirmedAt: new Date().toISOString() };
  await putPrivate(env, privateKeys.savedSearch(confirmed.id), confirmed);
  await addSavedSearchToCityIndex(env, confirmed.criteria.city, confirmed.id);
  return { record: confirmed };
}

// --- cancelamento (GET /api/saved-searches/unsubscribe) --------------------

export async function unsubscribeSavedSearch(env, token) {
  const claims = await verifyToken(env, token, "unsubscribe");
  if (!claims) throw new InvalidSavedSearchTokenError();

  const record = await getPrivate(env, privateKeys.savedSearch(claims.savedSearchId));
  if (!record) throw new InvalidSavedSearchTokenError();

  if (record.status === "unsubscribed") return { record, alreadyUnsubscribed: true };

  const wasConfirmed = record.status === "confirmed";
  const unsubscribed = { ...record, status: "unsubscribed", unsubscribedAt: new Date().toISOString() };
  await putPrivate(env, privateKeys.savedSearch(unsubscribed.id), unsubscribed);
  if (wasConfirmed) {
    await removeSavedSearchFromCityIndex(env, unsubscribed.criteria.city, unsubscribed.id);
  }
  return { record: unsubscribed };
}

// --- match (§20/§21 — mesmos campos de filtro do card/índice compacto) ----

/** Pura e testável: compara um critério salvo contra um listing público (schemas/listing-public.schema.json). */
export function matchesCriteria(criteria, listingPublic) {
  if (listingPublic?.location?.city !== criteria.city) return false;
  if (criteria.purpose && listingPublic.purpose !== criteria.purpose) return false;
  if (criteria.type && listingPublic.type !== criteria.type) return false;
  if (criteria.district && listingPublic.location?.district !== criteria.district) return false;
  if (criteria.priceMin !== undefined && !(listingPublic.price >= criteria.priceMin)) return false;
  if (criteria.priceMax !== undefined && !(listingPublic.price <= criteria.priceMax)) return false;

  const features = listingPublic.features ?? {};
  if (criteria.bedroomsMin !== undefined && !((features.bedrooms ?? 0) >= criteria.bedroomsMin)) return false;
  if (criteria.bathroomsMin !== undefined && !((features.bathrooms ?? 0) >= criteria.bathroomsMin)) return false;
  if (
    criteria.parkingSpacesMin !== undefined &&
    !((features.parkingSpaces ?? 0) >= criteria.parkingSpacesMin)
  ) {
    return false;
  }
  if (criteria.areaMin !== undefined && !((features.area ?? 0) >= criteria.areaMin)) return false;

  return true;
}

async function notifyIfMatch(env, savedSearchId, listingPublic, requestOrigin) {
  const record = await getPrivate(env, privateKeys.savedSearch(savedSearchId));
  if (!record || record.status !== "confirmed") return;
  if (record.notifiedListingSlugs.includes(listingPublic.slug)) return;
  if (!matchesCriteria(record.criteria, listingPublic)) return;

  const unsubscribeToken = await issueToken(env, "unsubscribe", savedSearchId, UNSUBSCRIBE_TOKEN_TTL_SECONDS);
  const unsubscribeUrl = `${requestOrigin}/api/saved-searches/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const listingUrl = `${requestOrigin}/imovel/${encodeURIComponent(listingPublic.slug)}`;

  await sendMatchNotificationEmail(env, { to: record.email, listingPublic, listingUrl, unsubscribeUrl });

  const updated = { ...record, notifiedListingSlugs: [...record.notifiedListingSlugs, listingPublic.slug] };
  await putPrivate(env, privateKeys.savedSearch(savedSearchId), updated);
}

/**
 * Ponto de entrada chamado pelo hook de publicação (decisão 3 —
 * modules/saved-search/index.js#checkSavedSearchesForListing, importado
 * por worker/api.js logo após cada `publishListing`, mesmo padrão de
 * `maybeRegenerateFeeds`/modules/feeds). Nunca lança: uma falha aqui
 * (Resend fora do ar, um registro corrompido) nunca deve derrubar a
 * resposta 200/201 do corretor que só estava salvando o próprio anúncio.
 * Um registro só é marcado como "notificado" para aquele listing depois
 * de o e-mail ter sido enviado com sucesso — se o envio falhar, a próxima
 * publicação desse mesmo anúncio tenta de novo (sem fila/retry dedicado,
 * ver README#pendências).
 */
export async function checkSavedSearchesForListing(env, citySlug, listingPublic, { requestOrigin } = {}) {
  if (!citySlug || !listingPublic) return;

  let savedSearchIds;
  try {
    savedSearchIds = await getSavedSearchIdsForCity(env, citySlug);
  } catch (error) {
    logger.error("saved_search_city_index_read_failed", { citySlug, message: error?.message });
    return;
  }
  if (savedSearchIds.length === 0) return;

  for (const savedSearchId of savedSearchIds) {
    try {
      await notifyIfMatch(env, savedSearchId, listingPublic, requestOrigin);
    } catch (error) {
      logger.error("saved_search_notify_failed", { savedSearchId, message: error?.message });
    }
  }
}
