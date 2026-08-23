// core/app.js
//
// Composes router + security headers + error handling into a small fetch
// handler factory (§71: Worker entry point deve ser pequeno). worker/index.js
// builds its router with `core/router.js` and wraps it with `createApp` so
// every response — success or error — gets consistent security headers and
// a safe error envelope instead of leaking a stack trace.

import { applySecurityHeaders } from "./security.js";
import { internalError, notFound } from "./response.js";
import { ValidationError } from "./validation.js";
import { ForbiddenError } from "./permissions.js";
import { TenantMismatchError } from "./tenant.js";
import { createLogger } from "./logger.js";

function errorToResponse(error, logger) {
  if (error instanceof ValidationError) {
    return applySecurityHeaders(
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: "validation_error", message: "Validation failed", details: error.errors },
        }),
        { status: 422, headers: { "Content-Type": "application/json; charset=utf-8" } },
      ),
    );
  }
  if (error instanceof ForbiddenError || error instanceof TenantMismatchError) {
    return applySecurityHeaders(
      new Response(
        JSON.stringify({ ok: false, error: { code: "forbidden", message: error.message } }),
        { status: 403, headers: { "Content-Type": "application/json; charset=utf-8" } },
      ),
    );
  }
  logger.error("unhandled_error", { message: error?.message, stack: error?.stack });
  return applySecurityHeaders(internalError());
}

/**
 * Builds a `fetch(request, env, ctx)` handler from a `Router`.
 * Every response — including 404s and thrown errors — passes through
 * `applySecurityHeaders` before it reaches the client.
 */
export function createApp(router, { loggerContext = "worker" } = {}) {
  const logger = createLogger(loggerContext);

  return async function fetch(request, env, ctx) {
    const url = new URL(request.url);
    const matched = router.match(request.method, url.pathname);

    if (!matched) {
      return applySecurityHeaders(notFound("Rota não encontrada."));
    }

    try {
      const response = await matched.handler(request, env, ctx, matched.params);
      return applySecurityHeaders(response);
    } catch (error) {
      return errorToResponse(error, logger);
    }
  };
}
