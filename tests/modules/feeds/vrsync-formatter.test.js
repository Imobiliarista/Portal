// modules/feeds/formatters/vrsync.js — geração do XML a partir de
// fixtures (listing-public.schema.json + listingId), puro, sem R2
// (§46, Etapa 9, submódulo "vrsync" do Modo Exportação).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapListingTypeToPropertyType,
  mapPurposeToTransactionType,
  escapeXmlText,
  cdata,
  buildVrsyncListingXml,
  generateVrsyncFeed,
} from "../../../modules/feeds/formatters/vrsync.js";

function baseListing(overrides = {}) {
  return {
    schemaVersion: 1,
    publicationVersion: 3,
    slug: "apartamento-centro-123",
    status: "active",
    title: "Apartamento no Centro",
    description: "Ótimo apartamento, 3 quartos, sol da manhã.",
    purpose: "venda",
    type: "apartamento",
    price: 450000,
    condominium: 650,
    iptu: 2200,
    location: { city: "londrina", district: "Centro", zipcode: "86010-000" },
    features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, area: 95 },
    gallery: ["https://media.imobiliarista.net/listings/1/cover-v1.webp", "https://media.imobiliarista.net/listings/1/gallery/2.webp"],
    video: null,
    tour360: null,
    broker: { slug: "joao", name: "João Imóveis" },
    ...overrides,
  };
}

const LISTING_ID = "listing_11111111-1111-1111-1111-111111111111";

// --- mapeamentos -------------------------------------------------------------

test("mapListingTypeToPropertyType maps known Portuguese types, case/accent-insensitively", () => {
  assert.equal(mapListingTypeToPropertyType("apartamento"), "Residential/Apartment");
  assert.equal(mapListingTypeToPropertyType("Apartamento"), "Residential/Apartment");
  assert.equal(mapListingTypeToPropertyType("Casa de Condomínio"), "Residential/Condominium");
  assert.equal(mapListingTypeToPropertyType("terreno"), "Residential/Land");
});

test("mapListingTypeToPropertyType returns null for an unmapped/unknown type", () => {
  assert.equal(mapListingTypeToPropertyType("tipo-que-nao-existe"), null);
  assert.equal(mapListingTypeToPropertyType(""), null);
  assert.equal(mapListingTypeToPropertyType(undefined), null);
});

test("mapPurposeToTransactionType maps venda/aluguel to VRSync's TransactionType", () => {
  assert.equal(mapPurposeToTransactionType("venda"), "For Sale");
  assert.equal(mapPurposeToTransactionType("aluguel"), "For Rent");
});

// --- escaping ------------------------------------------------------------

test("escapeXmlText escapes the 5 XML special characters", () => {
  assert.equal(escapeXmlText(`Título & "aspas" <tag> 'apóstrofo'`), "Título &amp; &quot;aspas&quot; &lt;tag&gt; &apos;apóstrofo&apos;");
});

test("cdata wraps content and neutralizes an embedded ]]> sequence", () => {
  assert.equal(cdata("texto simples"), "<![CDATA[texto simples]]>");
  assert.equal(cdata("a]]>b"), "<![CDATA[a]]]]><![CDATA[>b]]>");
});

// --- buildVrsyncListingXml -------------------------------------------------------

test("buildVrsyncListingXml builds a full <Listing> for a sale listing, using listingId (not slug) as ListingID", () => {
  const xml = buildVrsyncListingXml({ listing: baseListing(), listingId: LISTING_ID });
  assert.ok(xml.startsWith("<Listing>") && xml.endsWith("</Listing>"));
  assert.match(xml, new RegExp(`<ListingID>${LISTING_ID}</ListingID>`));
  assert.doesNotMatch(xml, /apartamento-centro-123/); // slug never leaks in as the id
  assert.match(xml, /<Title><!\[CDATA\[Apartamento no Centro\]\]><\/Title>/);
  assert.match(xml, /<TransactionType>For Sale<\/TransactionType>/);
  assert.match(xml, /<PropertyType>Residential\/Apartment<\/PropertyType>/);
  assert.match(xml, /<Description><!\[CDATA\[Ótimo apartamento, 3 quartos, sol da manhã\.\]\]><\/Description>/);
  assert.match(xml, /<ListPrice currency="BRL">450000<\/ListPrice>/);
  assert.doesNotMatch(xml, /RentalPrice/);
  assert.match(xml, /<PostalCode>86010-000<\/PostalCode>/);
  assert.match(xml, /<LivingArea>95<\/LivingArea>/);
  assert.doesNotMatch(xml, /LotArea/);
});

test("buildVrsyncListingXml uses RentalPrice (not ListPrice) for an aluguel listing", () => {
  const xml = buildVrsyncListingXml({ listing: baseListing({ purpose: "aluguel", price: 2750 }), listingId: LISTING_ID });
  assert.match(xml, /<TransactionType>For Rent<\/TransactionType>/);
  assert.match(xml, /<RentalPrice currency="BRL">2750<\/RentalPrice>/);
  assert.doesNotMatch(xml, /ListPrice/);
});

test("buildVrsyncListingXml reports area as LotArea (not LivingArea) for a terreno", () => {
  const xml = buildVrsyncListingXml({ listing: baseListing({ type: "terreno" }), listingId: LISTING_ID });
  assert.match(xml, /<LotArea>95<\/LotArea>/);
  assert.doesNotMatch(xml, /LivingArea/);
});

test("buildVrsyncListingXml returns null for a listing whose type has no PropertyType mapping", () => {
  assert.equal(buildVrsyncListingXml({ listing: baseListing({ type: "tipo-inexistente" }), listingId: LISTING_ID }), null);
});

test("buildVrsyncListingXml returns null for a listing with no zipcode (PostalCode is required)", () => {
  const listing = baseListing({ location: { city: "londrina", district: "Centro" } }); // no zipcode
  assert.equal(buildVrsyncListingXml({ listing, listingId: LISTING_ID }), null);
});

test("buildVrsyncListingXml marks only the first gallery photo as primary, and omits primary on the rest", () => {
  const xml = buildVrsyncListingXml({ listing: baseListing(), listingId: LISTING_ID });
  assert.match(xml, /<Item medium="image" primary="true">https:\/\/media\.imobiliarista\.net\/listings\/1\/cover-v1\.webp<\/Item>/);
  assert.match(xml, /<Item medium="image">https:\/\/media\.imobiliarista\.net\/listings\/1\/gallery\/2\.webp<\/Item>/);
});

test("buildVrsyncListingXml includes a video Media item for a listing with a YouTube video", () => {
  const xml = buildVrsyncListingXml({ listing: baseListing({ video: { provider: "youtube", id: "abc123" } }), listingId: LISTING_ID });
  assert.match(xml, /<Item medium="video">https:\/\/www\.youtube\.com\/watch\?v=abc123<\/Item>/);
});

test("buildVrsyncListingXml escapes title/description text that contains XML-special characters", () => {
  const xml = buildVrsyncListingXml({ listing: baseListing({ title: 'Casa & "Terreno" <top>' }), listingId: LISTING_ID });
  assert.match(xml, /<Title><!\[CDATA\[Casa & "Terreno" <top>\]\]><\/Title>/);
});

// --- generateVrsyncFeed -------------------------------------------------------

const HEADER = {
  provider: "Imobiliarista",
  email: "contato@imobiliarista.net",
  contactName: "Imobiliarista",
  telephone: "11-30000000",
  publishDate: "2026-08-25T12:00:00.000Z",
};

test("generateVrsyncFeed wraps the Header + every Listing in the VRSync root element (namespace/schemaLocation)", () => {
  const xml = generateVrsyncFeed([{ listing: baseListing(), listingId: LISTING_ID }], HEADER);
  assert.match(
    xml,
    /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<ListingDataFeed xmlns="http:\/\/www\.vivareal\.com\/schemas\/1\.0\/VRSync" xmlns:xsi="http:\/\/www\.w3\.org\/2001\/XMLSchema-instance" xsi:schemaLocation="http:\/\/www\.vivareal\.com\/schemas\/1\.0\/VRSync http:\/\/xml\.vivareal\.com\/vrsync\.xsd">/,
  );
  assert.match(xml, /<Provider>Imobiliarista<\/Provider>/);
  assert.match(xml, /<Email>contato@imobiliarista\.net<\/Email>/);
  assert.match(xml, /<ContactName>Imobiliarista<\/ContactName>/);
  assert.match(xml, /<PublishDate>2026-08-25T12:00:00\.000Z<\/PublishDate>/);
  assert.match(xml, /<Telephone>11-30000000<\/Telephone>/);
  assert.match(xml, /<Listings><Listing>/);
  assert.match(xml, /<\/Listings><\/ListingDataFeed>$/);
});

test("generateVrsyncFeed omits <Telephone> when the header has none", () => {
  const xml = generateVrsyncFeed([], { ...HEADER, telephone: null });
  assert.doesNotMatch(xml, /Telephone/);
});

test("generateVrsyncFeed silently excludes disqualified items (unmapped type, missing zipcode), keeping the rest", () => {
  const items = [
    { listing: baseListing({ slug: "ok-1" }), listingId: "listing_ok-1" },
    { listing: baseListing({ slug: "bad-tipo", type: "tipo-inexistente" }), listingId: "listing_bad-tipo" },
    { listing: baseListing({ slug: "bad-cep", location: { city: "londrina", district: "Centro" } }), listingId: "listing_bad-cep" },
    { listing: baseListing({ slug: "ok-2" }), listingId: "listing_ok-2" },
  ];
  const xml = generateVrsyncFeed(items, HEADER);
  assert.match(xml, /<ListingID>listing_ok-1<\/ListingID>/);
  assert.match(xml, /<ListingID>listing_ok-2<\/ListingID>/);
  assert.doesNotMatch(xml, /bad-tipo/);
  assert.doesNotMatch(xml, /bad-cep/);
});

test("generateVrsyncFeed produces a valid empty feed for zero items", () => {
  const xml = generateVrsyncFeed([], HEADER);
  assert.match(xml, /<Listings><\/Listings>/);
});
