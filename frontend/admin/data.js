// frontend/admin/data.js
//
// Browser → Worker /api/admin/* + /api/auth/* (§72, §53, Etapa 8), same
// pattern as frontend/painel/data.js: every call goes through the
// same-origin Worker with the session cookie riding along
// (`credentials: "same-origin"`), never a direct R2 read/write, never an
// R2 credential in the browser (§56).

/** Thrown for any non-2xx response; `status` lets callers special-case 401/403. */
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
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json; charset=utf-8", ...options.headers },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // no body
  }

  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new ApiError(response.status, error.code ?? "error", error.message ?? `HTTP ${response.status}`, error.details);
  }

  return payload?.data;
}

// --- auth (§72, §27 hotfix — PBKDF2 no navegador) -----------------------------
// Duplicated between frontend/admin/data.js and frontend/painel/data.js
// (byte-for-byte — each SPA host under Static Assets is self-contained,
// and frontend/shared/ is reserved for scripts/generate-*.js output, not
// hand-written code) rather than a shared import — keep both copies in
// sync if this changes.
//
// `password` is used only in-memory to derive `pbkdf2Result` via Web
// Crypto — never sent, never persisted to localStorage/sessionStorage/
// IndexedDB. See core/auth.js / business/auth.js for the Worker side.

const PBKDF2_KEY_LENGTH_BITS = 256;

function pbkdf2ToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function pbkdf2FromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derivePbkdf2(password, saltB64, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: pbkdf2FromBase64(saltB64), iterations, hash: "SHA-256" },
    keyMaterial,
    PBKDF2_KEY_LENGTH_BITS,
  );
  return pbkdf2ToBase64(new Uint8Array(derived));
}

/** Fetches the CPF's PBKDF2 salt, derives the result locally, then logs in. */
export async function login(cpf, password) {
  const { salt, iterations } = await apiFetch("/api/auth/salt", { method: "POST", body: JSON.stringify({ cpf }) });
  const pbkdf2Result = await derivePbkdf2(password, salt, iterations);
  return apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ cpf, pbkdf2Result }) });
}

export function logout() {
  return apiFetch("/api/auth/logout", { method: "POST" });
}

// --- corretores (§72, §53, Etapa 8) -------------------------------------------
export function listBrokers(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch(`/api/admin/brokers${query}`);
}

export function approveBroker(brokerId) {
  return apiFetch(`/api/admin/brokers/${encodeURIComponent(brokerId)}/approve`, { method: "POST" });
}

export function suspendBroker(brokerId) {
  return apiFetch(`/api/admin/brokers/${encodeURIComponent(brokerId)}/suspend`, { method: "POST" });
}

export function reactivateBroker(brokerId) {
  return apiFetch(`/api/admin/brokers/${encodeURIComponent(brokerId)}/activate`, { method: "POST" });
}

export function publishBroker(brokerId) {
  return apiFetch(`/api/admin/brokers/${encodeURIComponent(brokerId)}/publish`, { method: "POST" });
}

export function assignBrokerPlan(brokerId, planId) {
  return apiFetch(`/api/admin/brokers/${encodeURIComponent(brokerId)}/plan`, {
    method: "PUT",
    body: JSON.stringify({ planId }),
  });
}

// --- planos (§72, §52, §53, Etapa 8b) -----------------------------------------
export function listPlans() {
  return apiFetch("/api/admin/plans");
}

export function createPlan(input) {
  return apiFetch("/api/admin/plans", { method: "POST", body: JSON.stringify(input) });
}

export function updatePlan(planId, patch) {
  return apiFetch(`/api/admin/plans/${encodeURIComponent(planId)}`, { method: "PUT", body: JSON.stringify(patch) });
}

export function deletePlan(planId) {
  return apiFetch(`/api/admin/plans/${encodeURIComponent(planId)}`, { method: "DELETE" });
}

// --- rebuild manual (§72, §53, §33-34, Etapa 8) -------------------------------
export function rebuildCity(citySlug) {
  return apiFetch(`/api/admin/rebuild/city/${encodeURIComponent(citySlug)}`, { method: "POST" });
}

export function rebuildAll(cursor) {
  return apiFetch("/api/admin/rebuild/all", { method: "POST", body: JSON.stringify(cursor != null ? { cursor } : {}) });
}
