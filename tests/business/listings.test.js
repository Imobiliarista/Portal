import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createListing,
  updateListing,
  getListingById,
  listListingsByBroker,
  ListingNotFoundError,
  ListingConflictError,
  GalleryLimitExceededError,
} from "../../business/listings.js";
import { createPlan } from "../../business/plans.js";
import { ValidationError } from "../../core/validation.js";
import { TenantMismatchError } from "../../core/tenant.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";
import { nextCpf } from "../support/cpf.js";

// §27 hotfix (PR #19) — createBroker now requires a real CPF plus the live
// LOGIN_INDEX_SECRET to key it (storage/indexes.js).
const LOGIN_INDEX_SECRET = "test-login-index-secret-do-not-use-in-prod";

// Etapa 8b (§52/§53): the gallery cap now comes from business/plans.js's
// seeded default plan (DEFAULT_PLAN_ID, maxGalleryItems 50) whenever the
// broker referenced by createListing/updateListing has no real broker
// record — same as a broker with no plan assigned (see
// business/plans.js#getGalleryLimitForBroker). 50 here mirrors that
// seeded default, not a constant these tests import anymore.
const DEFAULT_GALLERY_LIMIT = 50;

function makeEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket() };
}

function baseInput(overrides = {}) {
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

test("createListing persists a draft matching listing-draft.schema.json's required shape", async () => {
  const env = makeEnv();
  const draft = await createListing(env, "broker_1", baseInput());

  assert.equal(draft.schemaVersion, 1);
  assert.match(draft.listingId, /^listing_/);
  assert.equal(draft.brokerId, "broker_1");
  assert.equal(draft.city, "londrina");
  assert.equal(draft.slug, "apartamento-centro-123");
  assert.equal(draft.status, "draft");
  assert.deepEqual(draft.features, { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, area: 95 });
  assert.ok(draft.updatedAt);
});

test("createListing writes a manifest (§30) with draftKey/publicKey derived from storage/keys.js", async () => {
  const env = makeEnv();
  const draft = await createListing(env, "broker_1", baseInput());

  const manifestRaw = await env.IMOB_PRIVATE.get(`listings/${draft.listingId}/manifest.json`);
  const manifest = await manifestRaw.json();
  assert.equal(manifest.brokerId, "broker_1");
  assert.equal(manifest.draftKey, `listings/${draft.listingId}/draft.json`);
  assert.equal(manifest.publicKey, "listings/apartamento-centro-123.json");
});

test("createListing registers the listing under the broker's listings-by-broker index", async () => {
  const env = makeEnv();
  const draft = await createListing(env, "broker_1", baseInput());

  const listings = await listListingsByBroker(env, "broker_1");
  assert.equal(listings.length, 1);
  assert.equal(listings[0].listingId, draft.listingId);
});

test("createListing ignores a brokerId smuggled inside the input body (§55)", async () => {
  const env = makeEnv();
  const draft = await createListing(env, "broker_1", baseInput({ brokerId: "broker_attacker" }));
  assert.equal(draft.brokerId, "broker_1");
});

test("createListing rejects a duplicate slug", async () => {
  const env = makeEnv();
  await createListing(env, "broker_1", baseInput());
  await assert.rejects(
    () => createListing(env, "broker_2", baseInput()),
    ListingConflictError,
  );
});

test("createListing rejects missing required fields", async () => {
  const env = makeEnv();
  await assert.rejects(() => createListing(env, "broker_1", { city: "londrina" }), ValidationError);
});

test("createListing rejects malformed features", async () => {
  const env = makeEnv();
  await assert.rejects(
    () => createListing(env, "broker_1", baseInput({ features: { bedrooms: -1, bathrooms: 2, parkingSpaces: 2, area: 95 } })),
    ValidationError,
  );
});

// zipcode (§46 — added to support the OLX feed's required `zipcode` field,
// optional here: a listing without it just isn't eligible for that feed,
// see modules/feeds/README.md).
test("createListing accepts and persists a valid zipcode", async () => {
  const env = makeEnv();
  const draft = await createListing(env, "broker_1", baseInput({ zipcode: "86010-000" }));
  assert.equal(draft.zipcode, "86010-000");
});

test("createListing omits zipcode entirely when not provided (never defaults to null/empty)", async () => {
  const env = makeEnv();
  const draft = await createListing(env, "broker_1", baseInput());
  assert.equal("zipcode" in draft, false);
});

test("createListing rejects a malformed zipcode", async () => {
  const env = makeEnv();
  await assert.rejects(() => createListing(env, "broker_1", baseInput({ zipcode: "not-a-cep" })), ValidationError);
});

test("updateListing accepts a valid zipcode patch", async () => {
  const env = makeEnv();
  const draft = await createListing(env, "broker_1", baseInput());
  const updated = await updateListing(env, "broker_1", draft.listingId, { zipcode: "86010000" });
  assert.equal(updated.zipcode, "86010000");
});

test("createListing requires an explicit brokerId argument", async () => {
  const env = makeEnv();
  await assert.rejects(() => createListing(env, "", baseInput()), ValidationError);
});

test("getListingById returns null for an unknown id", async () => {
  const env = makeEnv();
  assert.equal(await getListingById(env, "listing_never"), null);
});

test("listListingsByBroker returns an empty array for a broker with no listings", async () => {
  const env = makeEnv();
  assert.deepEqual(await listListingsByBroker(env, "broker_none"), []);
});

test("listListingsByBroker never returns another broker's listings", async () => {
  const env = makeEnv();
  await createListing(env, "broker_1", baseInput({ slug: "casa-1" }));
  await createListing(env, "broker_2", baseInput({ slug: "casa-2" }));

  const listings = await listListingsByBroker(env, "broker_1");
  assert.equal(listings.length, 1);
  assert.equal(listings[0].slug, "casa-1");
});

test("updateListing updates allowlisted fields and bumps updatedAt", async () => {
  const env = makeEnv();
  const draft = await createListing(env, "broker_1", baseInput());
  const before = draft.updatedAt;

  const updated = await updateListing(env, "broker_1", draft.listingId, {
    price: 470000,
    status: "active",
  });

  assert.equal(updated.price, 470000);
  assert.equal(updated.status, "active");
  assert.ok(new Date(updated.updatedAt).getTime() >= new Date(before).getTime());
});

test("updateListing syncs status/city onto the manifest", async () => {
  const env = makeEnv();
  const draft = await createListing(env, "broker_1", baseInput());
  await updateListing(env, "broker_1", draft.listingId, { status: "sold" });

  const manifestRaw = await env.IMOB_PRIVATE.get(`listings/${draft.listingId}/manifest.json`);
  const manifest = await manifestRaw.json();
  assert.equal(manifest.status, "sold");
});

test("updateListing throws TenantMismatchError when called by a different broker (§55)", async () => {
  const env = makeEnv();
  const draft = await createListing(env, "broker_1", baseInput());

  await assert.rejects(
    () => updateListing(env, "broker_2", draft.listingId, { price: 1 }),
    TenantMismatchError,
  );

  // and the listing itself was left untouched
  const unchanged = await getListingById(env, draft.listingId);
  assert.equal(unchanged.price, 450000);
});

test("updateListing throws ListingNotFoundError for an unknown listingId", async () => {
  const env = makeEnv();
  await assert.rejects(
    () => updateListing(env, "broker_1", "listing_ghost", { price: 1 }),
    ListingNotFoundError,
  );
});

test("updateListing rejects a gallery beyond the broker's plan limit (§52/§53, Etapa 8b) — falls back to the default plan when the broker has none assigned", async () => {
  const env = makeEnv();
  const draft = await createListing(env, "broker_1", baseInput());

  const tooMany = Array.from(
    { length: DEFAULT_GALLERY_LIMIT + 1 },
    (_, i) => `https://media.imobiliarista.net/listings/${draft.listingId}/gallery/${i}.webp`,
  );

  await assert.rejects(
    () => updateListing(env, "broker_1", draft.listingId, { gallery: tooMany }),
    GalleryLimitExceededError,
  );
});

test("updateListing accepts a gallery exactly at the default plan's cap", async () => {
  const env = makeEnv();
  const draft = await createListing(env, "broker_1", baseInput());

  const atCap = Array.from(
    { length: DEFAULT_GALLERY_LIMIT },
    (_, i) => `https://media.imobiliarista.net/listings/${draft.listingId}/gallery/${i}.webp`,
  );

  const updated = await updateListing(env, "broker_1", draft.listingId, { gallery: atCap });
  assert.equal(updated.gallery.length, DEFAULT_GALLERY_LIMIT);
});

test("updateListing respects a higher limit from a broker's actual assigned plan", async () => {
  const env = makeEnv();
  const { createBroker } = await import("../../business/brokers.js");
  await createPlan(env, { planId: "premium", name: "Premium", maxGalleryItems: 80 });
  const broker = await createBroker(
    env,
    {
      userId: "user_1",
      slug: "joao",
      name: "João",
      plan: "premium",
      email: "joao@imobiliarista.net",
      cpf: nextCpf(),
    },
    { loginIndexSecret: LOGIN_INDEX_SECRET },
  );

  const draft = await createListing(env, broker.brokerId, baseInput({ slug: "outro-imovel" }));
  const galleryUrl = (i) => `https://media.imobiliarista.net/listings/${draft.listingId}/gallery/${i}.webp`;

  // Above the default plan's 50 but within this broker's own "premium"
  // plan (80) — would have been rejected before this lot's plan-derived
  // limit existed.
  const above50BelowPlan = Array.from({ length: DEFAULT_GALLERY_LIMIT + 10 }, (_, i) => galleryUrl(i));
  const updated = await updateListing(env, broker.brokerId, draft.listingId, { gallery: above50BelowPlan });
  assert.equal(updated.gallery.length, DEFAULT_GALLERY_LIMIT + 10);

  const beyondPlan = Array.from({ length: 81 }, (_, i) => galleryUrl(i));
  await assert.rejects(
    () => updateListing(env, broker.brokerId, draft.listingId, { gallery: beyondPlan }),
    GalleryLimitExceededError,
  );
});

test("updateListing ignores brokerId/slug present in the patch body", async () => {
  const env = makeEnv();
  const draft = await createListing(env, "broker_1", baseInput());

  const updated = await updateListing(env, "broker_1", draft.listingId, {
    brokerId: "broker_attacker",
    slug: "hijacked-slug",
    price: 500000,
  });

  assert.equal(updated.brokerId, "broker_1");
  assert.equal(updated.slug, draft.slug);
  assert.equal(updated.price, 500000);
});
