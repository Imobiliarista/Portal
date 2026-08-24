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
import { createBroker } from "../../business/brokers.js";
import { createListing } from "../../business/listings.js";
import { SESSION_COOKIE_NAME } from "../../core/session.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";

const SECRET = "test-secret-do-not-use-in-prod";
const ORIGIN = "https://painel.imobiliarista.net";

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket(), IMOB_MEDIA: new FakeR2Bucket(), SESSION_SECRET: SECRET };
}

async function makeBrokerSession(env, overrides = {}) {
  const broker = await createBroker(env, {
    userId: overrides.userId ?? "user_000789",
    slug: overrides.slug ?? "joao",
    name: overrides.name ?? "João Imóveis",
    plan: "premium",
    email: overrides.email ?? "joao@imobiliarista.net",
  });
  await setAuthPassword(env, broker.userId, overrides.password ?? "correct horse battery staple");
  const { token } = await login(
    env,
    { email: overrides.email ?? "joao@imobiliarista.net", password: overrides.password ?? "correct horse battery staple" },
    SECRET,
  );
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

test("POST /api/me/media enforces the provisional per-listing gallery cap", async () => {
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
