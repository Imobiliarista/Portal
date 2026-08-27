// frontend/shared/public-data-errors.js
//
// Erros tipados + `fetchJson` compartilhados entre frontend/portal/data.js
// e frontend/minisite/data.js (Etapa 8, missão "corrigir a falha de
// produção em que https://imobiliarista.net permanece eternamente em
// Carregando…"). R2 DATA é lido direto do Browser nos dois SPAs (§2, §73),
// então a mesma distinção de estados precisa valer nos dois — daí viver em
// `frontend/shared/`, não duplicado, mesmo padrão já usado por
// `frontend/shared/comparison.generated.js`/`video-youtube.generated.js`.
//
// Causa raiz que este arquivo substitui: a versão anterior de `fetchJson`
// (frontend/portal/data.js, commit 697f1a3) já evitava a promessa
// travada/rejeitada sem handler, mas colapsava TUDO — 404 legítimo, falha
// de rede, CORS bloqueado — em `null`, e qualquer HTTP não-2xx num
// `Error` genérico sem tipo. Isso por si só não causava o "Carregando…"
// eterno (a causa raiz real era `portal/cities.json` nunca ter sido
// publicado, corrigido em business/publishing.js#publishPortalCatalogs) —
// mas colapsar os estados em `null` impede o chamador de saber SE deveria
// mostrar "não encontrado" (dado que não existe, estado legítimo, §75/§77)
// ou "não consegui carregar, tente de novo" (falha de transporte, o
// visitante deveria poder tentar de novo). As 4 classes abaixo tornam essa
// distinção explícita e nunca deixam uma rejeição sem tratamento chegar ao
// chamador sem passar por uma delas.

export class PublicDataNotFoundError extends Error {
  constructor(url) {
    super(`Recurso público não encontrado: ${url}`);
    this.name = "PublicDataNotFoundError";
    this.url = url;
  }
}

export class PublicDataHttpError extends Error {
  constructor(url, status) {
    super(`Falha HTTP ${status} ao buscar ${url}`);
    this.name = "PublicDataHttpError";
    this.url = url;
    this.status = status;
  }
}

export class PublicDataNetworkError extends Error {
  constructor(url, cause) {
    super(`Falha de rede/CORS ao buscar ${url}`);
    this.name = "PublicDataNetworkError";
    this.url = url;
    this.cause = cause;
  }
}

export class PublicDataContractError extends Error {
  constructor(url, cause) {
    super(`Resposta de ${url} não é um JSON válido`);
    this.name = "PublicDataContractError";
    this.url = url;
    this.cause = cause;
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * GETs and parses JSON, always resolving to a value or throwing exactly
 * one of the 4 classes above — never an unhandled/uncategorized rejection,
 * never an infinite retry loop (Etapa 8 "não fazer retry infinito; permitir
 * um retry manual pelo usuário" — this function tries exactly once;
 * `frontend/portal/app.js`'s route handlers own the "Tentar novamente"
 * button that calls it again).
 *
 *   - HTTP 404                          -> PublicDataNotFoundError.
 *   - other non-2xx                     -> PublicDataHttpError.
 *   - `fetch()` never got a response at
 *     all (network down, CORS-blocked,
 *     DNS failure, or `timeoutMs`
 *     elapsed)                          -> PublicDataNetworkError.
 *   - response body isn't valid JSON    -> PublicDataContractError.
 *
 * A caller decides, per key, whether a 404 is a legitimate "does not exist
 * yet" (a city/listing/broker profile — §75/§77) or an unexpected outage
 * (the 3 global catalogs, always published since Etapa 3 — see
 * business/publishing.js#publishPortalCatalogs) — this function only
 * classifies, it never decides that for the caller.
 */
export async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    throw new PublicDataNetworkError(url, error);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) throw new PublicDataNotFoundError(url);
  if (!response.ok) throw new PublicDataHttpError(url, response.status);

  try {
    return await response.json();
  } catch (error) {
    throw new PublicDataContractError(url, error);
  }
}

/**
 * Maps a caught error to one of `render.js#renderDataUnavailable`'s 3
 * message reasons ("network"/"http"/"contract"). Callers must catch
 * `PublicDataNotFoundError` themselves BEFORE reaching this classifier —
 * whether a 404 means "not found" (legitimate absence) or an unexpected
 * outage is a per-route decision this function never makes; anything that
 * isn't a recognized `PublicData*Error` (including a stray
 * `PublicDataNotFoundError` that slipped through, or a genuinely unknown
 * error) safely defaults to "network", never throws.
 */
export function classifyPublicDataErrorReason(error) {
  if (error instanceof PublicDataContractError) return "contract";
  if (error instanceof PublicDataHttpError) return "http";
  return "network";
}
