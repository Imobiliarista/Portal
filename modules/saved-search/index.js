// modules/saved-search/index.js
//
// Ponto de entrada HTTP público do módulo busca-salva-email (§43, Etapa 9).
// §43 é só a árvore de arquivos deste módulo (index.js, service.js,
// notifications.js, README.md) — sem routes.js, diferente de
// modules/appointments (§41, que lista routes.js na árvore). Por isso os
// handlers do Worker moram aqui mesmo: thin, mesmo padrão de worker/api.js
// ("parseia a request, chama business/service, mapeia pra
// core/response.js") — worker/index.js importa direto daqui, sem um
// arquivo routes.js intermediário que a árvore oficial não previu.
//
// Rotas públicas (nenhuma exige sessão/tenant — decisão 1, ver README.md):
//   POST /api/saved-searches            cria o registro + dispara e-mail de confirmação
//   GET  /api/saved-searches/confirm    confirma via token assinado (?token=)
//   GET  /api/saved-searches/unsubscribe cancela via token assinado (?token=)
//
// `checkSavedSearchesForListing` (reexportado de service.js) é o outro
// meio de entrada do módulo — não HTTP, chamado por worker/api.js logo
// após cada `publishListing` bem-sucedido (decisão 3: hook direto no
// fluxo de publicação, mesmo padrão que já liga modules/feeds ali, sem
// cron novo).

import { failure, success } from "../../core/response.js";
import { ValidationError } from "../../core/validation.js";
import {
  createSavedSearch,
  confirmSavedSearch,
  unsubscribeSavedSearch,
  checkSavedSearchesForListing,
  SavedSearchRateLimitedError,
  InvalidSavedSearchTokenError,
} from "./service.js";

export { checkSavedSearchesForListing };

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || null;
}

async function readJsonBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new ValidationError([{ field: "body", message: "JSON inválido." }]);
  }
}

// Sem frontend/página dedicada neste lote (fora do escopo pedido — ver
// README#pendências): o link do e-mail aponta direto para estas rotas do
// Worker, que respondem com uma página HTML mínima própria em vez de um
// JSON — é o que roda quando alguém clica o link a partir do cliente de
// e-mail, sem depender de nenhuma SPA existir para isso.
function htmlPage(title, message, { status = 200 } = {}) {
  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${title} — Imobiliarista</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; text-align: center;">
  <h1>${title}</h1>
  <p>${message}</p>
</body>
</html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// --- POST /api/saved-searches ------------------------------------------------
export async function handleCreateSavedSearch(request, env) {
  const body = await readJsonBody(request);
  const requestOrigin = new URL(request.url).origin;
  try {
    const result = await createSavedSearch(env, body, { ip: clientIp(request), requestOrigin });
    return success(result, { status: 202 });
  } catch (error) {
    if (error instanceof SavedSearchRateLimitedError) {
      return failure("rate_limited", error.message, { status: 429 });
    }
    throw error;
  }
}

// --- GET /api/saved-searches/confirm -----------------------------------------
export async function handleConfirmSavedSearch(request, env) {
  const token = new URL(request.url).searchParams.get("token");
  try {
    const { alreadyConfirmed, alreadyUnsubscribed } = await confirmSavedSearch(env, token);
    if (alreadyUnsubscribed) {
      return htmlPage(
        "Busca já cancelada",
        "Esta busca salva já foi cancelada anteriormente. Salve uma nova busca no portal para voltar a receber alertas.",
      );
    }
    if (alreadyConfirmed) {
      return htmlPage("Busca já confirmada", "Esta busca salva já estava confirmada — você já recebe os alertas dela.");
    }
    return htmlPage(
      "Busca confirmada!",
      "A partir de agora você recebe um e-mail sempre que um imóvel novo combinar com essa busca.",
    );
  } catch (error) {
    if (error instanceof InvalidSavedSearchTokenError) {
      return htmlPage("Link inválido", "Este link de confirmação é inválido ou expirou.", { status: 400 });
    }
    throw error;
  }
}

// --- GET /api/saved-searches/unsubscribe -------------------------------------
export async function handleUnsubscribeSavedSearch(request, env) {
  const token = new URL(request.url).searchParams.get("token");
  try {
    const { alreadyUnsubscribed } = await unsubscribeSavedSearch(env, token);
    if (alreadyUnsubscribed) {
      return htmlPage("Alertas já cancelados", "Esta busca salva já estava cancelada — nenhum alerta será enviado.");
    }
    return htmlPage("Alertas cancelados", "Você não vai mais receber e-mails sobre essa busca salva.");
  } catch (error) {
    if (error instanceof InvalidSavedSearchTokenError) {
      return htmlPage("Link inválido", "Este link de cancelamento é inválido ou expirou.", { status: 400 });
    }
    throw error;
  }
}
