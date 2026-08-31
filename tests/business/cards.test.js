import { test } from "node:test";
import assert from "node:assert/strict";
import { buildListingCard, buildIndexEntry } from "../../business/cards.js";

function baseListingPublic(overrides = {}) {
  return {
    schemaVersion: 1,
    publicationVersion: 1,
    slug: "apartamento-centro-123",
    status: "active",
    title: "Apartamento no Centro",
    description: "Ótimo apartamento",
    purpose: "venda",
    type: "apartamento",
    price: 450000,
    condominium: 650,
    iptu: 2200,
    location: { city: "londrina", district: "Centro" },
    features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, livingArea: 95 },
    gallery: ["https://media.imobiliarista.net/listings/x/gallery/1.webp"],
    video: null,
    tour360: null,
    broker: { slug: "joao", name: "João Imóveis" },
    ...overrides,
  };
}

test("buildListingCard maps listing-public + listingId into a city-shard card (§13)", () => {
  const card = buildListingCard("listing_000123", baseListingPublic());
  assert.deepEqual(card, {
    id: "listing_000123",
    slug: "apartamento-centro-123",
    title: "Apartamento no Centro",
    purpose: "venda",
    type: "apartamento",
    price: 450000,
    district: "Centro",
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 2,
    area: 95,
    cover: "https://media.imobiliarista.net/listings/x/gallery/1.webp",
    brokerSlug: "joao",
    featured: false,
    priority: 0,
  });
});

test("buildListingCard falls back to a null cover when the gallery is empty", () => {
  const card = buildListingCard("listing_000123", baseListingPublic({ gallery: [] }));
  assert.equal(card.cover, null);
});

test("buildListingCard includes suites/unitFloor when present, but never lotArea/livingRooms/kitchens (detail-page-only fields)", () => {
  const card = buildListingCard(
    "listing_000123",
    baseListingPublic({
      features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, livingArea: 95, lotArea: 360, livingRooms: 2, kitchens: 1, suites: 1, unitFloor: 8 },
    }),
  );
  assert.equal(card.suites, 1);
  assert.equal(card.unitFloor, 8);
  assert.equal("lotArea" in card, false);
  assert.equal("livingRooms" in card, false);
  assert.equal("kitchens" in card, false);
});

test("buildListingCard omits suites/unitFloor entirely when absent from features (never null)", () => {
  const card = buildListingCard("listing_000123", baseListingPublic());
  assert.equal("suites" in card, false);
  assert.equal("unitFloor" in card, false);
});

test("buildIndexEntry derives a city-index entry (§21) from a card, given a shard number", () => {
  const card = buildListingCard("listing_000123", baseListingPublic());
  const entry = buildIndexEntry(card, 1);
  assert.deepEqual(entry, {
    id: "listing_000123",
    slug: "apartamento-centro-123",
    shard: 1,
    purpose: "venda",
    type: "apartamento",
    district: "Centro",
    price: 450000,
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 2,
    area: 95,
  });
});
