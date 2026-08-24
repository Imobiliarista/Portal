// frontend/painel/data.js
//
// Browser → Worker /api/me/* (§54, §72), unlike frontend/portal/data.js and
// frontend/minisite/data.js which read R2 DATA directly (§73). The painel
// is exactly the "private" side of the architecture (§2's segundo fluxo:
// PAINEL → Worker/API → R2 PRIVATE), so every call here goes through the
// same-origin Worker with the session cookie riding along
// (`credentials: "same-origin"`) — never a direct R2 read/write, never an
// R2 credential in the browser (§56).

/** Thrown for any non-2xx response; `status` lets callers special-case 401 (§54 "tratamento de sessão expirada"). */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isSessionExpired(error) {
  return error instanceof ApiError && error.status === 401;
}

async function apiFetch(path, options = {}) {
  const isFormBody = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: isFormBody ? options.headers : { "Content-Type": "application/json; charset=utf-8", ...options.headers },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // no body (e.g. a network-level failure surfaced as a non-JSON response)
  }

  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new ApiError(response.status, error.code ?? "error", error.message ?? `HTTP ${response.status}`, error.details);
  }

  return payload?.data;
}

// --- auth (§72, Etapa 4) ------------------------------------------------------
export function login(email, password) {
  return apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function logout() {
  return apiFetch("/api/auth/logout", { method: "POST" });
}

// --- perfil (§72, §54) --------------------------------------------------------
export function getProfile() {
  return apiFetch("/api/me/profile");
}

export function updateProfile(patch) {
  return apiFetch("/api/me/profile", { method: "PUT", body: JSON.stringify(patch) });
}

// --- imóveis (§72, §54) -------------------------------------------------------
export function listListings() {
  return apiFetch("/api/me/listings");
}

export function createListing(input) {
  return apiFetch("/api/me/listings", { method: "POST", body: JSON.stringify(input) });
}

export function getListing(id) {
  return apiFetch(`/api/me/listings/${encodeURIComponent(id)}`);
}

export function updateListing(id, patch) {
  return apiFetch(`/api/me/listings/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) });
}

export function deleteListing(id) {
  return apiFetch(`/api/me/listings/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// --- mídia (§56-57, §72) ------------------------------------------------------
/** `target`: "listing-gallery" | "broker-logo" | "broker-cover". `listingId` required for "listing-gallery". */
export function uploadMedia(file, target, listingId) {
  const form = new FormData();
  form.set("file", file);
  form.set("target", target);
  if (listingId) form.set("listingId", listingId);
  return apiFetch("/api/me/media", { method: "POST", body: form });
}

export function deleteMedia(id) {
  return apiFetch(`/api/me/media/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// worker/uploads.js returns a media `id` at upload time (the R2 key,
// base64url-encoded), but a profile fetched via GET /api/me/profile only
// carries the resulting `logo`/`cover` URL — so deleting an existing one
// (not one just uploaded this session) needs to derive that same id back
// from the URL. Duplicated here rather than imported because Workers
// Static Assets can't reach worker/uploads.js from frontend/ (see this
// file's header comment, and frontend/portal/data.js's for the same
// constraint on the read side) — it must stay byte-for-byte in sync with
// worker/uploads.js#encodeMediaId.
const MEDIA_BASE_URL = "https://media.imobiliarista.net";

export function mediaIdFromUrl(url) {
  if (typeof url !== "string" || !url.startsWith(`${MEDIA_BASE_URL}/`)) return null;
  const key = url.slice(`${MEDIA_BASE_URL}/`.length);
  const bytes = new TextEncoder().encode(key);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
