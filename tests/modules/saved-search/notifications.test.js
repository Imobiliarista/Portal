// Unit tests for modules/saved-search/notifications.js (§43, Etapa 9) —
// the only file in this module that talks to Resend. `fetch` is mocked
// (same pattern as modules/financial/provider.test.js) so no real email
// is ever sent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sendEmail, sendConfirmationEmail, sendMatchNotificationEmail, ResendApiError } from "../../../modules/saved-search/notifications.js";

const ENV = { RESEND_API_KEY: "resend-test-key" };

function mockFetchOnce(responseInit) {
  const previousFetch = globalThis.fetch;
  let capturedRequest = null;
  globalThis.fetch = async (url, init) => {
    capturedRequest = { url, init };
    return new Response(JSON.stringify(responseInit.body ?? {}), { status: responseInit.status ?? 200 });
  };
  return {
    restore: () => {
      globalThis.fetch = previousFetch;
    },
    getRequest: () => capturedRequest,
  };
}

test("sendEmail POSTs to the Resend API with a Bearer token and the given fields", async () => {
  const mock = mockFetchOnce({ body: { id: "email_1" } });
  try {
    const result = await sendEmail(ENV, { to: "visitante@example.com", subject: "Assunto", html: "<p>Oi</p>" });
    assert.equal(result.id, "email_1");

    const { url, init } = mock.getRequest();
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(init.headers.Authorization, "Bearer resend-test-key");
    const body = JSON.parse(init.body);
    assert.equal(body.to[0], "visitante@example.com");
    assert.equal(body.subject, "Assunto");
    assert.match(body.from, /imobiliarista\.net/);
  } finally {
    mock.restore();
  }
});

test("sendEmail throws a ResendApiError carrying the status, with the raw response body kept OFF .message", async () => {
  // §79/observabilidade (Etapa 11 sub-lote 4): a Resend validation error
  // routinely echoes back the rejected field's value (here, standing in
  // for a visitor's e-mail address) — and every caller of sendEmail logs
  // via `{ message: error?.message }` (core/logger.js redacts by field
  // NAME, not by content), so that value must never ride inside .message.
  const mock = mockFetchOnce({ status: 422, body: "invalid `to` field: visitante@example.com" });
  try {
    await assert.rejects(
      () => sendEmail(ENV, { to: "visitante@example.com", subject: "x", html: "x" }),
      (error) => {
        assert.ok(error instanceof ResendApiError);
        assert.equal(error.status, 422);
        assert.doesNotMatch(error.message, /visitante@example\.com/, ".message must never carry the raw Resend response body");
        assert.match(error.responseBody, /visitante@example\.com/, "the raw body is still available off .message, for a caller that opts in");
        return true;
      },
    );
  } finally {
    mock.restore();
  }
});

test("sendEmail throws a clear error when RESEND_API_KEY is missing, never calling fetch", async () => {
  const mock = mockFetchOnce({ body: {} });
  try {
    await assert.rejects(() => sendEmail({}, { to: "x@example.com", subject: "x", html: "x" }), /RESEND_API_KEY/);
    assert.equal(mock.getRequest(), null);
  } finally {
    mock.restore();
  }
});

test("sendConfirmationEmail escapes the confirm URL and includes it as a link", async () => {
  const mock = mockFetchOnce({ body: {} });
  try {
    await sendConfirmationEmail(ENV, { to: "x@example.com", confirmUrl: "https://x.com/?token=a&b=1" });
    const { init } = mock.getRequest();
    const body = JSON.parse(init.body);
    assert.match(body.html, /href="https:\/\/x\.com\/\?token=a&amp;b=1"/);
    assert.match(body.subject, /Confirme/);
  } finally {
    mock.restore();
  }
});

test("sendMatchNotificationEmail includes the listing title, formatted price, and unsubscribe link", async () => {
  const mock = mockFetchOnce({ body: {} });
  try {
    await sendMatchNotificationEmail(ENV, {
      to: "x@example.com",
      listingPublic: { title: "Casa <especial>", price: 350000 },
      listingUrl: "https://imobiliarista.net/imovel/casa",
      unsubscribeUrl: "https://imobiliarista.net/api/saved-searches/unsubscribe?token=abc",
    });
    const { init } = mock.getRequest();
    const body = JSON.parse(init.body);
    assert.match(body.html, /Casa &lt;especial&gt;/, "listing title must be HTML-escaped");
    assert.match(body.html, /R\$/);
    assert.match(body.html, /unsubscribe\?token=abc/);
  } finally {
    mock.restore();
  }
});

test("sendMatchNotificationEmail omits the price line when price isn't a number", async () => {
  const mock = mockFetchOnce({ body: {} });
  try {
    await sendMatchNotificationEmail(ENV, {
      to: "x@example.com",
      listingPublic: { title: "Casa" },
      listingUrl: "https://imobiliarista.net/imovel/casa",
      unsubscribeUrl: "https://imobiliarista.net/api/saved-searches/unsubscribe?token=abc",
    });
    const { init } = mock.getRequest();
    const body = JSON.parse(init.body);
    assert.doesNotMatch(body.html, /R\$/);
  } finally {
    mock.restore();
  }
});
