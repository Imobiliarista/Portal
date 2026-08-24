import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPrice, formatArea, formatPurpose, cardViewModel, listingViewModel } from "../../../frontend/portal/render.js";

test("formatPrice formats BRL without cents", () => {
  assert.equal(formatPrice(450000), "R$ 450.000");
  assert.equal(formatPrice("not a number"), "—");
});

test("formatArea appends m²", () => {
  assert.equal(formatArea(95), "95 m²");
  assert.equal(formatArea(undefined), "—");
});

test("formatPurpose maps the enum to pt-BR labels", () => {
  assert.equal(formatPurpose("venda"), "Venda");
  assert.equal(formatPurpose("aluguel"), "Aluguel");
});

test("cardViewModel builds a renderable model from a city-shard card (§13)", () => {
  const card = {
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
    cover: "https://media.imobiliarista.net/x.webp",
    brokerSlug: "joao",
    featured: true,
    priority: 1,
  };
  const vm = cardViewModel(card);
  assert.equal(vm.href, "/imovel/apartamento-centro-123");
  assert.equal(vm.priceLabel, "R$ 450.000");
  assert.equal(vm.purposeLabel, "Venda");
  assert.equal(vm.featured, true);
});

test("listingViewModel builds a renderable model from listing-public (§15)", () => {
  const listing = {
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
    features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, area: 95 },
    gallery: ["https://media.imobiliarista.net/1.webp"],
    video: { provider: "youtube", id: "abc123" },
    tour360: null,
    broker: { slug: "joao", name: "João" },
  };
  const vm = listingViewModel(listing);
  assert.equal(vm.condominiumLabel, "R$ 650");
  assert.equal(vm.iptuLabel, "R$ 2.200");
  assert.equal(vm.district, "Centro");
  assert.equal(vm.bedrooms, 3);
  assert.equal(vm.brokerName, "João");
  assert.equal(vm.unavailableMessage, null);
});

test("listingViewModel surfaces a status message for non-active listings (§64)", () => {
  const vm = listingViewModel({ status: "sold", features: {}, location: {} });
  assert.equal(vm.unavailableMessage, "Este imóvel já foi vendido.");
});
