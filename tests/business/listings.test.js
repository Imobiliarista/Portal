import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createListing,
  updateListing,
  getListingById,
  listListingsByBroker,
  ListingNotFoundError,
  ListingConflictError,
} from "../../business/listings.js";
import { ValidationError } from "../../core/validation.js";
import { TenantMismatchError } from "../../core/tenant.js";
import { FakeR2Bucket } from "../storage/fake-r2-bucket.js";

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
