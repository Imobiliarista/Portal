// End-to-end wiring for the painel's private API (§72, §54, Etapa 5 —
// §90). Mirrors tests/security/auth-flow.test.js: handlers are called
// directly (not through core/router.js) against a FakeR2Bucket-backed env
// and a real session cookie minted by a real login, so this exercises the
// same chain a live /api/me/* request goes through.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleGetProfile,
  handlePutProfile,
  handleListListings,
  handleCreateListing,
  handleGetListing,
  handlePutListing,
  handleDeleteListing,
} from "../../worker/api.js";
import { handleUploadMedia, handleDeleteMedia } from "../../worker/uploads.js";
import { login, setAuthPassword } from "../../business/auth.js";
import { createBroker, suspendBroker } from "../../business/brokers.js";
import { createListing } from "../../business/listings.js";
import { createPlan, assignBrokerPlan } from "../../business/plans.js";
import { deriveClientPbkdf2 } from "../../core/auth.js";
import { SESSION_COOKIE_NAME } from "../../core/session.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";
import { nextCpf } from "../support/cpf.js";

const SESSION_SECRET = "test-session-secret-do-not-use-in-prod";
const PASSWORD_PEPPER = "test-pepper-do-not-use-in-prod";
const LOGIN_INDEX_SECRET = "test-login-index-secret-do-not-use-in-prod";
const SECRETS = { sessionSecret: SESSION_SECRET, pepper: PASSWORD_PEPPER, loginIndexSecret: LOGIN_INDEX_SECRET };
const ORIGIN = "https://painel.imobiliarista.net";

function makeEnv() {
  return {
    IMOB_PRIVATE: new FakeR2Bucket(),
    IMOB_DATA: new FakeR2Bucket(),
    IMOB_MEDIA: new FakeR2Bucket(),
    SESSION_SECRET,
  };
}

// §27 hotfix (PR #19) — CPF + browser-side PBKDF2 replaced e-mail+password;
// mint a real session the same way the browser would (deriveClientPbkdf2
// against the record's real salt), never by faking claims directly.
async function makeBrokerSession(env, overrides = {}) {
  const broker = await createBroker(
    env,
    {
      userId: overrides.userId ?? "user_000789",
      slug: overrides.slug ?? "joao",
      name: overrides.name ?? "João Imóveis",
      plan: "premium",
      cpf: overrides.cpf ?? nextCpf(),
    },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );
  const authRecord = await setAuthPassword(env, broker.userId, overrides.password ?? "correct horse battery staple", {
    pepper: PASSWORD_PEPPER,
  });
  const pbkdf2Result = await deriveClientPbkdf2(
    overrides.password ?? "correct horse battery staple",
    authRecord.pbkdf2Salt,
    authRecord.pbkdf2Iterations,
  );
  const { token } = await login(env, { identifier: broker.cpf, pbkdf2Result }, SECRETS);
  return { broker, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

function req(path, { method = "GET", cookie, body, headers = {} } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function baseListingInput(overrides = {}) {
  return {
    city: "londrina",
    slug: "apartamento-centro-123",
    title: "Apartamento no Centro",
    purpose: "venda",
    type: "apartamento",
    price: 450000,
    features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, area: 95 },
    ...overrides,
  };
}

// --- /api/me/profile ---------------------------------------------------------

test("GET /api/me/profile returns the caller's own profile", async () => {
  const env = makeEnv();
  const { broker, cookie } = await makeBrokerSession(env);

  const response = await handleGetProfile(req("/api/me/profile", { cookie }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.brokerId, broker.brokerId);
});

test("GET /api/me/profile without a session returns 401", async () => {
  const env = makeEnv();
  await assert.rejects(() => handleGetProfile(req("/api/me/profile"), env));
});

// --- Etapa 8 (§53): sessão de corretor suspenso perde acesso a /api/me/* imediatamente ---
// Sessões são stateless (§28) — sem isso, um corretor suspenso mid-sessão
// continuaria usando o painel normalmente até o cookie expirar.

test("a broker suspended mid-session is blocked from /api/me/* on the very next request, even with a still-valid cookie", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env);

  // sanity: the session works before suspension
  const before = await handleGetProfile(req("/api/me/profile", { cookie }), env);
  assert.equal(before.status, 200);

  const broker = (await before.json()).data;
  await suspendBroker(env, broker.brokerId);

  await assert.rejects(() => handleGetProfile(req("/api/me/profile", { cookie }), env));
  await assert.rejects(() =>
    handlePutProfile(req("/api/me/profile", { method: "PUT", cookie, body: { name: "Tentativa" } }), env),
  );
});

test("PUT /api/me/profile updates allowlisted fields only", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env);

  const response = await handlePutProfile(
    req("/api/me/profile", { method: "PUT", cookie, body: { name: "João Silva", status: "active" } }),
    env,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.name, "João Silva");
  assert.equal(body.data.status, "pending"); // status is not in PROFILE_UPDATE_ALLOWED_FIELDS — silently dropped
});

// --- /api/me/listings ----------------------------------------------------------

test("POST /api/me/listings creates a listing scoped to the session's own brokerId, ignoring a smuggled brokerId", async () => {
  const env = makeEnv();
  const { broker, cookie } = await makeBrokerSession(env);

  const response = await handleCreateListing(
    req("/api/me/listings", { method: "POST", cookie, body: baseListingInput({ brokerId: "broker_attacker" }) }),
    env,
  );
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.brokerId, broker.brokerId);
});

test("GET /api/me/listings only lists the caller's own listings", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env, { userId: "user_a", slug: "joao", email: "joao@imobiliarista.net" });
  await makeBrokerSession(env, { userId: "user_b", slug: "maria", email: "maria@imobiliarista.net" });

  await handleCreateListing(req("/api/me/listings", { method: "POST", cookie, body: baseListingInput() }), env);

  const response = await handleListListings(req("/api/me/listings", { cookie }), env);
  const body = await response.json();
  assert.equal(body.data.length, 1);
});

test("GET /api/me/listings/:id on another broker's listing is blocked (§55)", async () => {
  const env = makeEnv();
  const { cookie: cookieA } = await makeBrokerSession(env, { userId: "user_a", slug: "joao", email: "joao@imobiliarista.net" });
  const { cookie: cookieB } = await makeBrokerSession(env, { userId: "user_b", slug: "maria", email: "maria@imobiliarista.net" });

  const created = await handleCreateListing(
    req("/api/me/listings", { method: "POST", cookie: cookieB, body: baseListingInput({ slug: "casa-da-maria" }) }),
    env,
  );
  const listingB = (await created.json()).data;

  await assert.rejects(() => handleGetListing(req(`/api/me/listings/${listingB.listingId}`, { cookie: cookieA }), env, null, { id: listingB.listingId }));
});

test("PUT /api/me/listings/:id on another broker's listing is blocked (§55)", async () => {
  const env = makeEnv();
  const { cookie: cookieA } = await makeBrokerSession(env, { userId: "user_a", slug: "joao", email: "joao@imobiliarista.net" });
  const { cookie: cookieB } = await makeBrokerSession(env, { userId: "user_b", slug: "maria", email: "maria@imobiliarista.net" });

  const created = await handleCreateListing(
    req("/api/me/listings", { method: "POST", cookie: cookieB, body: baseListingInput({ slug: "casa-da-maria-2" }) }),
    env,
  );
  const listingB = (await created.json()).data;

  await assert.rejects(() =>
    handlePutListing(
      req(`/api/me/listings/${listingB.listingId}`, { method: "PUT", cookie: cookieA, body: { price: 1 } }),
      env,
      null,
      { id: listingB.listingId },
    ),
  );
});

test("GET /api/me/listings/:id for an unknown id returns 404", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env);
  const response = await handleGetListing(req("/api/me/listings/listing_ghost", { cookie }), env, null, { id: "listing_ghost" });
  assert.equal(response.status, 404);
});

test("PUT /api/me/listings/:id updates the caller's own listing", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env);
  const created = await handleCreateListing(req("/api/me/listings", { method: "POST", cookie, body: baseListingInput() }), env);
  const listing = (await created.json()).data;

  const response = await handlePutListing(
    req(`/api/me/listings/${listing.listingId}`, { method: "PUT", cookie, body: { price: 500000 } }),
    env,
    null,
    { id: listing.listingId },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.price, 500000);
});

test("DELETE /api/me/listings/:id soft-deletes (status: removed) instead of removing the R2 object", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env);
  const created = await handleCreateListing(req("/api/me/listings", { method: "POST", cookie, body: baseListingInput() }), env);
  const listing = (await created.json()).data;

  const response = await handleDeleteListing(req(`/api/me/listings/${listing.listingId}`, { method: "DELETE", cookie }), env, null, {
    id: listing.listingId,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.status, "removed");

  const stillThere = await env.IMOB_PRIVATE.get(`listings/${listing.listingId}/draft.json`);
  assert.ok(stillThere, "the draft object itself must still exist — this is a soft delete");
});

test("DELETE /api/me/listings/:id on another broker's listing is blocked (§55)", async () => {
  const env = makeEnv();
  const { cookie: cookieA } = await makeBrokerSession(env, { userId: "user_a", slug: "joao", email: "joao@imobiliarista.net" });
  const { cookie: cookieB } = await makeBrokerSession(env, { userId: "user_b", slug: "maria", email: "maria@imobiliarista.net" });

  const created = await handleCreateListing(
    req("/api/me/listings", { method: "POST", cookie: cookieB, body: baseListingInput({ slug: "casa-da-maria-3" }) }),
    env,
  );
  const listingB = (await created.json()).data;

  await assert.rejects(() =>
    handleDeleteListing(req(`/api/me/listings/${listingB.listingId}`, { method: "DELETE", cookie: cookieA }), env, null, {
      id: listingB.listingId,
    }),
  );
});

// --- Etapa 6 — Publicador: painel -> portal público, ponta a ponta -------------
// A primeira vez que um anúncio criado pelo corretor via painel (Etapa 5)
// passa a existir de fato no R2 DATA que o portal público (Etapa 2) lê —
// sem isso, POST/PUT/DELETE em /api/me/listings só mudavam o draft privado.

test("POST /api/me/listings with status:active publishes the listing into its city shard/index/manifest", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env);

  const response = await handleCreateListing(
    req("/api/me/listings", {
      method: "POST",
      cookie,
      body: baseListingInput({ district: "Centro", status: "active" }),
    }),
    env,
  );
  assert.equal(response.status, 201);
  const listing = (await response.json()).data;

  const listingPublicRaw = await env.IMOB_DATA.get("listings/apartamento-centro-123.json");
  assert.ok(listingPublicRaw, "listings/{slug}.json deve existir em R2 DATA");
  const listingPublic = await listingPublicRaw.json();
  assert.equal(listingPublic.status, "active");
  assert.equal(listingPublic.broker.slug, "joao");

  const shardRaw = await env.IMOB_DATA.get("cities/londrina/001.json");
  const shard = await shardRaw.json();
  assert.equal(shard.length, 1);
  assert.equal(shard[0].id, listing.listingId);
  assert.equal(shard[0].slug, "apartamento-centro-123");

  const manifestRaw = await env.IMOB_DATA.get("cities/londrina/manifest.json");
  const manifest = await manifestRaw.json();
  assert.equal(manifest.totalListings, 1);
  assert.equal(manifest.publicationVersion, 1);
  assert.equal(manifest.city.uf, "PR");
});

test("DELETE /api/me/listings/:id on a previously active listing pulls its card out of the shard but keeps the public link (§64)", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env);

  const created = await handleCreateListing(
    req("/api/me/listings", {
      method: "POST",
      cookie,
      body: baseListingInput({ district: "Centro", status: "active" }),
    }),
    env,
  );
  const listing = (await created.json()).data;

  await handleDeleteListing(req(`/api/me/listings/${listing.listingId}`, { method: "DELETE", cookie }), env, null, {
    id: listing.listingId,
  });

  const shard = await (await env.IMOB_DATA.get("cities/londrina/001.json")).json();
  assert.equal(shard.length, 0);

  const listingPublic = await (await env.IMOB_DATA.get("listings/apartamento-centro-123.json")).json();
  assert.equal(listingPublic.status, "removed");
});

// --- /api/me/media --------------------------------------------------------------

function makeUploadRequest({ cookie, fileBytes, contentType, target, listingId }) {
  const form = new FormData();
  form.set("file", new File([fileBytes], "photo.webp", { type: contentType }));
  form.set("target", target);
  if (listingId) form.set("listingId", listingId);
  return new Request(`${ORIGIN}/api/me/media`, {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : {},
    body: form,
  });
}

test("POST /api/me/media uploads a gallery photo and appends its URL to the listing draft", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env);
  const created = await handleCreateListing(req("/api/me/listings", { method: "POST", cookie, body: baseListingInput() }), env);
  const listing = (await created.json()).data;

  const response = await handleUploadMedia(
    makeUploadRequest({ cookie, fileBytes: new Uint8Array([1, 2, 3]), contentType: "image/webp", target: "listing-gallery", listingId: listing.listingId }),
    env,
  );
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.data.url, /^https:\/\/media\.imobiliarista\.net\/listings\//);

  const getResponse = await handleGetListing(req(`/api/me/listings/${listing.listingId}`, { cookie }), env, null, { id: listing.listingId });
  const getBody = await getResponse.json();
  assert.deepEqual(getBody.data.gallery, [body.data.url]);
});

test("POST /api/me/media rejects a disallowed MIME type (§57), including video — vídeo é link, não upload", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env);
  const created = await handleCreateListing(req("/api/me/listings", { method: "POST", cookie, body: baseListingInput() }), env);
  const listing = (await created.json()).data;

  const response = await handleUploadMedia(
    makeUploadRequest({ cookie, fileBytes: new Uint8Array([1, 2, 3]), contentType: "video/mp4", target: "listing-gallery", listingId: listing.listingId }),
    env,
  );
  assert.equal(response.status, 400);
});

test("POST /api/me/media blocks uploading into another broker's listing (§55)", async () => {
  const env = makeEnv();
  const { cookie: cookieA } = await makeBrokerSession(env, { userId: "user_a", slug: "joao", email: "joao@imobiliarista.net" });
  const { cookie: cookieB } = await makeBrokerSession(env, { userId: "user_b", slug: "maria", email: "maria@imobiliarista.net" });

  const created = await handleCreateListing(
    req("/api/me/listings", { method: "POST", cookie: cookieB, body: baseListingInput({ slug: "casa-da-maria-4" }) }),
    env,
  );
  const listingB = (await created.json()).data;

  await assert.rejects(() =>
    handleUploadMedia(
      makeUploadRequest({ cookie: cookieA, fileBytes: new Uint8Array([1, 2, 3]), contentType: "image/webp", target: "listing-gallery", listingId: listingB.listingId }),
      env,
    ),
  );
});

test("POST /api/me/media enforces the per-listing gallery cap from the broker's plan (§52/§53, Etapa 8b — falls back to the seeded default plan's 50 here, since \"premium\" from makeBrokerSession isn't a real plan record in this env)", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env);
  const created = await handleCreateListing(
    req("/api/me/listings", {
      method: "POST",
      cookie,
      body: baseListingInput({
        gallery: Array.from({ length: 50 }, (_, i) => `https://media.imobiliarista.net/listings/x/gallery/${i}.webp`),
      }),
    }),
    env,
  );
  const listing = (await created.json()).data;

  const response = await handleUploadMedia(
    makeUploadRequest({ cookie, fileBytes: new Uint8Array([1, 2, 3]), contentType: "image/webp", target: "listing-gallery", listingId: listing.listingId }),
    env,
  );
  assert.equal(response.status, 409);
});

test("POST /api/me/media allows uploads past 50 once the broker is on a plan with a higher limit (§52/§53, Etapa 8b)", async () => {
  const env = makeEnv();
  await createPlan(env, { planId: "premium", name: "Premium", maxGalleryItems: 60 });

  const { broker, cookie } = await makeBrokerSession(env);
  await assignBrokerPlan(env, broker.brokerId, "premium");

  const created = await handleCreateListing(
    req("/api/me/listings", {
      method: "POST",
      cookie,
      body: baseListingInput({
        gallery: Array.from({ length: 50 }, (_, i) => `https://media.imobiliarista.net/listings/x/gallery/${i}.webp`),
      }),
    }),
    env,
  );
  const listing = (await created.json()).data;

  const response = await handleUploadMedia(
    makeUploadRequest({ cookie, fileBytes: new Uint8Array([1, 2, 3]), contentType: "image/webp", target: "listing-gallery", listingId: listing.listingId }),
    env,
  );
  assert.equal(response.status, 201);
});

test("POST /api/me/media uploads a broker logo and updates the profile", async () => {
  const env = makeEnv();
  const { broker, cookie } = await makeBrokerSession(env);

  const response = await handleUploadMedia(
    makeUploadRequest({ cookie, fileBytes: new Uint8Array([9, 9, 9]), contentType: "image/png", target: "broker-logo" }),
    env,
  );
  assert.equal(response.status, 201);
  const body = await response.json();

  const profileResponse = await handleGetProfile(req("/api/me/profile", { cookie }), env);
  const profileBody = await profileResponse.json();
  assert.equal(profileBody.data.logo, body.data.url);
  assert.equal(profileBody.data.brokerId, broker.brokerId);
});

test("DELETE /api/me/media/:id removes a gallery photo and clears it from the listing", async () => {
  const env = makeEnv();
  const { cookie } = await makeBrokerSession(env);
  const created = await handleCreateListing(req("/api/me/listings", { method: "POST", cookie, body: baseListingInput() }), env);
  const listing = (await created.json()).data;

  const uploadResponse = await handleUploadMedia(
    makeUploadRequest({ cookie, fileBytes: new Uint8Array([1, 2, 3]), contentType: "image/webp", target: "listing-gallery", listingId: listing.listingId }),
    env,
  );
  const uploaded = (await uploadResponse.json()).data;

  const deleteResponse = await handleDeleteMedia(req(`/api/me/media/${uploaded.id}`, { method: "DELETE", cookie }), env, null, { id: uploaded.id });
  assert.equal(deleteResponse.status, 200);

  const getResponse = await handleGetListing(req(`/api/me/listings/${listing.listingId}`, { cookie }), env, null, { id: listing.listingId });
  const getBody = await getResponse.json();
  assert.deepEqual(getBody.data.gallery, []);
});

test("DELETE /api/me/media/:id blocks deleting another broker's media (§55)", async () => {
  const env = makeEnv();
  const { cookie: cookieA } = await makeBrokerSession(env, { userId: "user_a", slug: "joao", email: "joao@imobiliarista.net" });
  const { cookie: cookieB } = await makeBrokerSession(env, { userId: "user_b", slug: "maria", email: "maria@imobiliarista.net" });

  const created = await handleCreateListing(
    req("/api/me/listings", { method: "POST", cookie: cookieB, body: baseListingInput({ slug: "casa-da-maria-5" }) }),
    env,
  );
  const listingB = (await created.json()).data;
  const uploadResponse = await handleUploadMedia(
    makeUploadRequest({ cookie: cookieB, fileBytes: new Uint8Array([1, 2, 3]), contentType: "image/webp", target: "listing-gallery", listingId: listingB.listingId }),
    env,
  );
  const uploaded = (await uploadResponse.json()).data;

  await assert.rejects(() =>
    handleDeleteMedia(req(`/api/me/media/${uploaded.id}`, { method: "DELETE", cookie: cookieA }), env, null, { id: uploaded.id }),
  );
});
