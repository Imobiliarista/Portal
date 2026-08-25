// modules/saved-search/notifications.js
//
// Envio de e-mail via Resend (§43, Etapa 9). Provedor e domínio decididos
// fora deste lote (instrução explícita do solicitante): Resend, domínio
// `imobiliarista.net` já verificado na conta Resend. A API key vive em
// `RESEND_API_KEY` (`wrangler secret put RESEND_API_KEY` — ver
// docs/OPERATIONS.md), nunca em wrangler.toml/Git (§3.1, §27).
//
// Só dois tipos de e-mail neste módulo: confirmação (double opt-in,
// decisão de produto) e alerta de match (um imóvel novo/editado combina
// com uma busca já confirmada). Nenhum HTML aqui carrega asset externo —
// texto simples + 1 link, sem imagem/CSS remoto.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM_ADDRESS = "Imobiliarista <alertas@imobiliarista.net>";

/**
 * Erro de resposta não-2xx do Resend. `.message` nunca inclui o corpo cru
 * da resposta (§79/observabilidade, Etapa 11 sub-lote 4) — um erro de
 * validação do Resend rotineiramente ecoa de volta o campo rejeitado (ex.
 * `to`), e este é o único ponto do módulo cujo erro chega a
 * `modules/saved-search/service.js#createSavedSearch`/`notifyIfMatch`
 * como `logger.error(..., { message: error?.message })` — `core/logger.js`
 * redige por NOME de campo, não por conteúdo, então um e-mail de visitante
 * embutido em `.message` vazaria para o log sem essa separação. O corpo
 * cru fica em `.responseBody`, nunca logado por nenhum chamador atual —
 * mesmo padrão que `modules/financial/provider.js#AsaasApiError` já usa
 * para o corpo de erro do Asaas.
 */
export class ResendApiError extends Error {
  constructor(status, responseBody) {
    super(`Resend respondeu ${status} ao enviar e-mail.`);
    this.name = "ResendApiError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

function resendApiKey(env) {
  if (!env?.RESEND_API_KEY) {
    throw new Error("modules/saved-search: binding RESEND_API_KEY ausente em env.");
  }
  return env.RESEND_API_KEY;
}

const HTML_ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

/**
 * Chamada de baixo nível à API do Resend. Lança em qualquer resposta não-2xx
 * — quem chama decide se isso deve derrubar a requisição (criação de busca,
 * onde não deveria) ou só ser logado (hook de publicação).
 */
export async function sendEmail(env, { to, subject, html }) {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey(env)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ResendApiError(response.status, body.slice(0, 500));
  }
  return response.json();
}

export async function sendConfirmationEmail(env, { to, confirmUrl }) {
  const safeUrl = escapeHtml(confirmUrl);
  const html = `
    <p>Você (ou alguém em seu nome) pediu para salvar uma busca de imóveis no Imobiliarista.</p>
    <p>Para começar a receber alertas por e-mail sempre que um imóvel novo combinar com essa busca, confirme clicando no link abaixo:</p>
    <p><a href="${safeUrl}">Confirmar busca salva</a></p>
    <p>Se você não pediu isso, pode ignorar este e-mail — nenhum alerta será enviado sem essa confirmação.</p>
  `.trim();
  return sendEmail(env, { to, subject: "Confirme sua busca salva — Imobiliarista", html });
}

export async function sendMatchNotificationEmail(env, { to, listingPublic, listingUrl, unsubscribeUrl }) {
  const title = escapeHtml(listingPublic?.title || "Novo imóvel");
  const price =
    typeof listingPublic?.price === "number"
      ? listingPublic.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : null;
  const html = `
    <p>Um imóvel novo combina com uma busca que você salvou no Imobiliarista:</p>
    <p><a href="${escapeHtml(listingUrl)}">${title}</a>${price ? ` — ${escapeHtml(price)}` : ""}</p>
    <p style="margin-top: 2rem; font-size: 0.85em; color: #555;">
      <a href="${escapeHtml(unsubscribeUrl)}">Cancelar estes alertas</a>
    </p>
  `.trim();
  return sendEmail(env, { to, subject: `Novo imóvel: ${listingPublic?.title || ""}`.trim(), html });
}
