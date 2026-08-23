// core/response.js
//
// Standard JSON response envelope for the private/transactional Worker API.
// §71 — the Worker flow ends in "response"; every handler should funnel
// through here so error shapes and headers stay consistent.

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

function envelope(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", JSON_CONTENT_TYPE);
  return new Response(JSON.stringify(body), { ...init, headers });
}

/** 2xx success envelope: { ok: true, data, meta? } */
export function success(data, { status = 200, meta, headers } = {}) {
  return envelope(
    { ok: true, data, ...(meta ? { meta } : {}) },
    { status, headers },
  );
}

/** Error envelope: { ok: false, error: { code, message, details? } } */
export function failure(
  code,
  message,
  { status = 400, details, headers } = {},
) {
  return envelope(
    {
      ok: false,
      error: { code, message, ...(details ? { details } : {}) },
    },
    { status, headers },
  );
}

export function badRequest(message, details) {
  return failure("bad_request", message, { status: 400, details });
}

export function unauthorized(message = "Autenticação necessária.") {
  return failure("unauthorized", message, { status: 401 });
}

export function forbidden(message = "Acesso negado.") {
  return failure("forbidden", message, { status: 403 });
}

export function notFound(message = "Recurso não encontrado.") {
  return failure("not_found", message, { status: 404 });
}

export function conflict(message = "Conflito de estado.") {
  return failure("conflict", message, { status: 409 });
}

export function internalError(message = "Erro interno.") {
  return failure("internal_error", message, { status: 500 });
}

export function notImplemented(message = "Ainda não implementado.") {
  return failure("not_implemented", message, { status: 501 });
}
