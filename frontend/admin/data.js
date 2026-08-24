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

// --- auth (§72, Etapa 4) ------------------------------------------------------
export function login(email, password) {
  return apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
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
