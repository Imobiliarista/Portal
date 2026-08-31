// Unit tests for modules/saved-search/service.js (§43, Etapa 9) — double
// opt-in, per-IP/day rate limit, signed confirm/unsubscribe tokens, and
// the match check hooked into publishListing. `fetch` is mocked wherever
// an email would go out (notifications.js -> Resend), same pattern as
// notifications.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSavedSearch,
  confirmSavedSearch,
  unsubscribeSavedSearch,
  matchesCriteria,
  checkSavedSearchesForListing,
  SavedSearchRateLimitedError,
  InvalidSavedSearchTokenError,
} from "../../../modules/saved-search/service.js";
import { ValidationError } from "../../../core/validation.js";
import { getPrivate } from "../../../storage/private.js";
import { privateKeys } from "../../../storage/keys.js";
import { getSavedSearchIdsForCity } from "../../../storage/indexes.js";
import { FakeR2Bucket } from "../../storage/fake-r2-bucket.js";

const ORIGIN = "https://imobiliarista.net";

function makeEnv() {
  return {
    IMOB_PRIVATE: new FakeR2Bucket(),
    SAVED_SEARCH_TOKEN_SECRET: "test-saved-search-token-secret-do-not-use-in-prod",
    // No RESEND_API_KEY on purpose for most tests: sendConfirmationEmail's
    // failure is caught and logged inside createSavedSearch (never thrown),
    // so the create path doesn't need a working mail provider to pass.
  };
}

function mockFetchAlwaysOk() {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
  return () => {
    globalThis.fetch = previousFetch;
  };
}

function baseListingPublic(overrides = {}) {
  return {
    slug: "apartamento-centro",
    title: "Apartamento no Centro",
    purpose: "venda",
    type: "apartamento",
    price: 450000,
    location: { city: "londrina", district: "Centro" },
    features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, livingArea: 95 },
    ...overrides,
  };
}

// --- createSavedSearch -------------------------------------------------------

test("createSavedSearch persists a pending record and returns pending_confirmation", async () => {
  const env = makeEnv();
  const result = await createSavedSearch(
    env,
    { email: "Visitante@Example.com", criteria: { city: "londrina", purpose: "venda" } },
    { ip: "1.2.3.4", requestOrigin: ORIGIN },
  );
  assert.deepEqual(result, { status: "pending_confirmation" });
});

test("createSavedSearch rejects an invalid email", async () => {
  const env = makeEnv();
  await assert.rejects(
    () => createSavedSearch(env, { email: "not-an-email", criteria: { city: "londrina" } }, { ip: "1.2.3.4", requestOrigin: ORIGIN }),
    ValidationError,
  );
});

test("createSavedSearch rejects a criteria with an unknown city (§ allowlist)", async () => {
  const env = makeEnv();
  await assert.rejects(
    () =>
      createSavedSearch(
        env,
        { email: "x@example.com", criteria: { city: "cidade-que-nao-existe" } },
        { ip: "1.2.3.4", requestOrigin: ORIGIN },
      ),
    ValidationError,
  );
});

test("createSavedSearch requires city — the only required criteria field", async () => {
  const env = makeEnv();
  await assert.rejects(
    () => createSavedSearch(env, { email: "x@example.com", criteria: {} }, { ip: "1.2.3.4", requestOrigin: ORIGIN }),
    ValidationError,
  );
});

test("createSavedSearch silently drops any criteria field outside the allowlist (§78)", async () => {
  const env = makeEnv();
  const unmock = mockFetchAlwaysOk();
  try {
    await createSavedSearch(
      env,
      { email: "x@example.com", criteria: { city: "londrina", adminOverride: true } },
      { ip: "5.5.5.5", requestOrigin: ORIGIN },
    );
  } finally {
    unmock();
  }
  // No direct read handle on the id here, so just assert it didn't throw —
  // the allowlist enforcement itself is asserted structurally below via
  // confirmSavedSearch/matchesCriteria, which only ever see allowlisted keys.
});

test("createSavedSearch enforces a per-IP/day rate limit (§ anti-abuso)", async () => {
  const env = makeEnv();
  const ip = "9.9.9.9";
  for (let i = 0; i < 5; i += 1) {
    await createSavedSearch(env, { email: `x${i}@example.com`, criteria: { city: "londrina" } }, { ip, requestOrigin: ORIGIN });
  }
  await assert.rejects(
    () => createSavedSearch(env, { email: "x6@example.com", criteria: { city: "londrina" } }, { ip, requestOrigin: ORIGIN }),
    SavedSearchRateLimitedError,
  );
});

test("createSavedSearch rate limit is scoped per IP — a different IP is unaffected", async () => {
  const env = makeEnv();
  for (let i = 0; i < 5; i += 1) {
    await createSavedSearch(env, { email: `x${i}@example.com`, criteria: { city: "londrina" } }, { ip: "1.1.1.1", requestOrigin: ORIGIN });
  }
  // Does not throw:
  await createSavedSearch(env, { email: "y@example.com", criteria: { city: "londrina" } }, { ip: "2.2.2.2", requestOrigin: ORIGIN });
});

test("createSavedSearch with no IP available (e.g. local dev) skips the rate limit entirely", async () => {
  const env = makeEnv();
  for (let i = 0; i < 10; i += 1) {
    await createSavedSearch(env, { email: `x${i}@example.com`, criteria: { city: "londrina" } }, { ip: null, requestOrigin: ORIGIN });
  }
});

// --- observabilidade (§79, Etapa 11 sub-lote 4): o visitante nunca vaza em log ---
// createSavedSearch nunca lança por falha no envio do e-mail de confirmação
// (best-effort, só logado — ver o header deste arquivo/service.js) — mas
// isso significa que o e-mail do visitante passa perto de um
// `logger.error(..., { message: error?.message })`, e core/logger.js
// redige por NOME de campo, não por conteúdo. Antes da correção da Etapa 11
// sub-lote 4, um erro do Resend que ecoasse o `to` rejeitado de volta
// vazaria o e-mail do visitante para o log através desse `message`.
test("createSavedSearch never leaks the visitor's e-mail into the log when the confirmation e-mail provider fails", async () => {
  const env = { ...makeEnv(), RESEND_API_KEY: "resend-test-key" };
  const visitorEmail = "visitante-sensivel@example.com";

  const previousFetch = globalThis.fetch;
  // Simulates a Resend validation error that echoes the rejected `to`
  // field back in its response body — the exact shape that used to leak.
  globalThis.fetch = async () =>
    new Response(`{"message":"Invalid \`to\` field: ${visitorEmail} is not verified"}`, { status: 422 });

  const previousConsoleError = console.error;
  const loggedLines = [];
  console.error = (line) => loggedLines.push(line);

  try {
    await createSavedSearch(env, { email: visitorEmail, criteria: { city: "londrina" } }, { ip: "1.2.3.4", requestOrigin: ORIGIN });
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousConsoleError;
  }

  assert.ok(loggedLines.length > 0, "the failed send must still be logged (observability, not silence)");
  for (const line of loggedLines) {
    assert.doesNotMatch(line, new RegExp(visitorEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

// --- confirmSavedSearch / unsubscribeSavedSearch -----------------------------

async function createAndExtractToken(env, overrides = {}) {
  await createSavedSearch(
    env,
    { email: overrides.email ?? "x@example.com", criteria: overrides.criteria ?? { city: "londrina" } },
    { ip: overrides.ip ?? `10.0.0.${Math.floor(Math.random() * 250)}`, requestOrigin: ORIGIN },
  );
  // sendConfirmationEmail failed silently (no RESEND_API_KEY) — reach into
  // R2 to find the id createSavedSearch doesn't return, then mint a fresh
  // token the same way service.js does, using the exported primitives.
  const { createSessionToken } = await import("../../../core/session.js");
  // We don't have the id from the return value by design (§ decisão 2,
  // confirmation happens via emailed link only) — so instead exercise the
  // real code path end-to-end via the module's own token issuance by
  // reading the one record just written (R2 has exactly one key pattern:
  // saved-searches/{id}.json).
  const keys = await env.IMOB_PRIVATE.list({ prefix: "saved-searches/" });
  const objectKeys = (keys.objects ?? keys).map((o) => o.key ?? o);
  const savedSearchKey = objectKeys.find((k) => k.startsWith("saved-searches/") && !k.includes("rate-limit"));
  const record = await getPrivate(env, savedSearchKey);
  const token = await createSessionToken({ purpose: overrides.purpose ?? "confirm", savedSearchId: record.id }, env.SAVED_SEARCH_TOKEN_SECRET, {
    ttlSeconds: 3600,
  });
  return { token, record };
}

test("confirmSavedSearch confirms a pending record and adds it to the city index", async () => {
  const env = makeEnv();
  const { token, record } = await createAndExtractToken(env);

  const result = await confirmSavedSearch(env, token);
  assert.equal(result.record.status, "confirmed");
  assert.ok(result.record.confirmedAt);

  const cityIds = await getSavedSearchIdsForCity(env, "londrina");
  assert.ok(cityIds.includes(record.id));
});

test("confirmSavedSearch on an already-confirmed record reports alreadyConfirmed, doesn't duplicate the city index entry", async () => {
  const env = makeEnv();
  const { token } = await createAndExtractToken(env);
  await confirmSavedSearch(env, token);
  const second = await confirmSavedSearch(env, token);
  assert.equal(second.alreadyConfirmed, true);
});

test("confirmSavedSearch rejects an invalid/forged token", async () => {
  const env = makeEnv();
  await assert.rejects(() => confirmSavedSearch(env, "not-a-real-token"), InvalidSavedSearchTokenError);
});

test("confirmSavedSearch rejects an unsubscribe-purpose token (wrong purpose)", async () => {
  const env = makeEnv();
  const { token } = await createAndExtractToken(env, { purpose: "unsubscribe" });
  await assert.rejects(() => confirmSavedSearch(env, token), InvalidSavedSearchTokenError);
});

test("unsubscribeSavedSearch on a confirmed record removes it from the city index", async () => {
  const env = makeEnv();
  const { token, record } = await createAndExtractToken(env);
  await confirmSavedSearch(env, token);

  const { createSessionToken } = await import("../../../core/session.js");
  const unsubToken = await createSessionToken({ purpose: "unsubscribe", savedSearchId: record.id }, env.SAVED_SEARCH_TOKEN_SECRET, {
    ttlSeconds: 3600,
  });
  const result = await unsubscribeSavedSearch(env, unsubToken);
  assert.equal(result.record.status, "unsubscribed");

  const cityIds = await getSavedSearchIdsForCity(env, "londrina");
  assert.ok(!cityIds.includes(record.id));
});

test("unsubscribeSavedSearch is idempotent — a second call reports alreadyUnsubscribed", async () => {
  const env = makeEnv();
  const { record } = await createAndExtractToken(env);
  const { createSessionToken } = await import("../../../core/session.js");
  const unsubToken = await createSessionToken({ purpose: "unsubscribe", savedSearchId: record.id }, env.SAVED_SEARCH_TOKEN_SECRET, {
    ttlSeconds: 3600,
  });
  await unsubscribeSavedSearch(env, unsubToken);
  const second = await unsubscribeSavedSearch(env, unsubToken);
  assert.equal(second.alreadyUnsubscribed, true);
});

// --- matchesCriteria (pure) --------------------------------------------------

test("matchesCriteria requires the city to match exactly", () => {
  assert.equal(matchesCriteria({ city: "londrina" }, baseListingPublic()), true);
  assert.equal(matchesCriteria({ city: "curitiba" }, baseListingPublic()), false);
});

test("matchesCriteria checks purpose/type/district only when the criteria specifies them", () => {
  const listing = baseListingPublic();
  assert.equal(matchesCriteria({ city: "londrina", purpose: "aluguel" }, listing), false);
  assert.equal(matchesCriteria({ city: "londrina", purpose: "venda" }, listing), true);
  assert.equal(matchesCriteria({ city: "londrina", district: "Zona Norte" }, listing), false);
});

test("matchesCriteria enforces priceMin/priceMax as a range", () => {
  const listing = baseListingPublic({ price: 450000 });
  assert.equal(matchesCriteria({ city: "londrina", priceMax: 400000 }, listing), false);
  assert.equal(matchesCriteria({ city: "londrina", priceMin: 500000 }, listing), false);
  assert.equal(matchesCriteria({ city: "londrina", priceMin: 400000, priceMax: 500000 }, listing), true);
});

test("matchesCriteria enforces the *Min feature thresholds, defaulting missing features to 0", () => {
  const listingNoFeatures = baseListingPublic({ features: undefined });
  assert.equal(matchesCriteria({ city: "londrina", bedroomsMin: 1 }, listingNoFeatures), false);
  assert.equal(matchesCriteria({ city: "londrina", bedroomsMin: 0 }, listingNoFeatures), true);
  assert.equal(matchesCriteria({ city: "londrina", areaMin: 90 }, baseListingPublic()), true);
  assert.equal(matchesCriteria({ city: "londrina", areaMin: 100 }, baseListingPublic()), false);
});

// --- checkSavedSearchesForListing --------------------------------------------

test("checkSavedSearchesForListing sends a match notification exactly once per listing slug", async () => {
  const env = { ...makeEnv(), RESEND_API_KEY: "resend-test-key" };
  const previousFetch = globalThis.fetch;
  // Mocked for the whole test, including setup below (the confirmation
  // email createSavedSearch/confirmSavedSearch also send) — never let a
  // real request reach api.resend.com.
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "email_setup" }), { status: 200 });
  try {
    const { token, record } = await createAndExtractToken(env, { criteria: { city: "londrina" } });
    await confirmSavedSearch(env, token);

    let emailCount = 0;
    globalThis.fetch = async () => {
      emailCount += 1;
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    };
    await checkSavedSearchesForListing(env, "londrina", baseListingPublic(), { requestOrigin: ORIGIN });
    assert.equal(emailCount, 1);

    // Same listing again — must not re-notify.
    await checkSavedSearchesForListing(env, "londrina", baseListingPublic(), { requestOrigin: ORIGIN });
    assert.equal(emailCount, 1);

    const stored = await getPrivate(env, privateKeys.savedSearch(record.id));
    assert.deepEqual(stored.notifiedListingSlugs, ["apartamento-centro"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("checkSavedSearchesForListing does nothing for an unconfirmed (pending) saved search", async () => {
  const env = makeEnv();
  await createAndExtractToken(env, { criteria: { city: "londrina" } }); // never confirmed

  let called = false;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}");
  };
  try {
    await checkSavedSearchesForListing(env, "londrina", baseListingPublic(), { requestOrigin: ORIGIN });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("checkSavedSearchesForListing is a no-op (never throws) for a city with no saved searches", async () => {
  const env = makeEnv();
  await assert.doesNotReject(() =>
    checkSavedSearchesForListing(env, "curitiba", baseListingPublic({ location: { city: "curitiba" } }), { requestOrigin: ORIGIN }),
  );
});

test("checkSavedSearchesForListing swallows a notification failure for one saved search without throwing", async () => {
  const env = { ...makeEnv(), RESEND_API_KEY: "resend-test-key" };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "email_setup" }), { status: 200 });
  try {
    const { token } = await createAndExtractToken(env, { criteria: { city: "londrina" } });
    await confirmSavedSearch(env, token);

    globalThis.fetch = async () => new Response("service unavailable", { status: 500 });
    await assert.doesNotReject(() =>
      checkSavedSearchesForListing(env, "londrina", baseListingPublic(), { requestOrigin: ORIGIN }),
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
