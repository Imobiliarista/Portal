// modules/feeds/formatters/olx.js — geração do XML a partir de fixtures
// (listing-public.schema.json + city ref), puro, sem R2 (§46, Etapa 9).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapListingTypeToPropertyType,
  mapPurposeToTransactionType,
  escapeXmlText,
  cdata,
  buildListingDetailUrl,
  buildOlxListingXml,
  formatOlxFeed,
} from "../../../modules/feeds/formatters/olx.js";

const LONDRINA = { name: "Londrina", uf: "PR" };

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
    location: { city: "londrina", district: "Centro" },
    features: { bedrooms: 3, bathrooms: 2, parkingSpaces: 2, area: 95 },
    gallery: ["https://media.imobiliarista.net/listings/1/cover-v1.webp", "https://media.imobiliarista.net/listings/1/gallery/2.webp"],
    video: null,
    tour360: null,
    broker: { slug: "joao", name: "João Imóveis" },
    ...overrides,
  };
}

// --- mapeamentos -------------------------------------------------------------

test("mapListingTypeToPropertyType maps known Portuguese types, case/accent-insensitively", () => {
  assert.equal(mapListingTypeToPropertyType("apartamento"), "Residential/Apartment");
  assert.equal(mapListingTypeToPropertyType("Apartamento"), "Residential/Apartment");
  assert.equal(mapListingTypeToPropertyType("Casa de Condomínio"), "Residential/Condominium");
  assert.equal(mapListingTypeToPropertyType("galpão"), "Commercial/Warehouse");
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

test("buildListingDetailUrl builds the §18 public listing URL", () => {
  assert.equal(buildListingDetailUrl("apartamento-centro-123"), "https://imobiliarista.net/imovel/apartamento-centro-123");
});

// --- buildOlxListingXml -------------------------------------------------------

test("buildOlxListingXml builds a full <Listing> for a sale listing", () => {
  const xml = buildOlxListingXml({ listing: baseListing(), city: LONDRINA });
  assert.ok(xml.startsWith("<Listing>") && xml.endsWith("</Listing>"));
  assert.match(xml, /<ListingID>apartamento-centro-123<\/ListingID>/);
  assert.match(xml, /<Title>Apartamento no Centro<\/Title>/);
  assert.match(xml, /<TransactionType>For Sale<\/TransactionType>/);
  assert.match(xml, /<PublicationType>STANDARD<\/PublicationType>/);
  assert.match(xml, /<DetailViewUrl>https:\/\/imobiliarista\.net\/imovel\/apartamento-centro-123<\/DetailViewUrl>/);
  assert.match(xml, /<PropertyType>Residential\/Apartment<\/PropertyType>/);
  assert.match(xml, /<Description><!\[CDATA\[Ótimo apartamento, 3 quartos, sol da manhã\.\]\]><\/Description>/);
  assert.match(xml, /<ListPrice currency="BRL">450000<\/ListPrice>/);
  assert.doesNotMatch(xml, /RentalPrice/);
  assert.match(xml, /<LivingArea unit="square meters">95<\/LivingArea>/);
  assert.match(xml, /<Bedrooms>3<\/Bedrooms>/);
  assert.match(xml, /<Bathrooms>2<\/Bathrooms>/);
  assert.match(xml, /<Garage>2<\/Garage>/);
  assert.match(xml, /<Country>Brazil<\/Country>/);
  assert.match(xml, /<State>PR<\/State>/);
  assert.match(xml, /<City>Londrina<\/City>/);
  assert.match(xml, /<Neighborhood>Centro<\/Neighborhood>/);
});

test("buildOlxListingXml uses RentalPrice (not ListPrice) for an aluguel listing", () => {
  const xml = buildOlxListingXml({ listing: baseListing({ purpose: "aluguel", price: 2750 }), city: LONDRINA });
  assert.match(xml, /<TransactionType>For Rent<\/TransactionType>/);
  assert.match(xml, /<RentalPrice currency="BRL" period="Monthly">2750<\/RentalPrice>/);
  assert.doesNotMatch(xml, /ListPrice/);
});

test("buildOlxListingXml returns null for a listing whose type has no PropertyType mapping", () => {
  assert.equal(buildOlxListingXml({ listing: baseListing({ type: "tipo-inexistente" }), city: LONDRINA }), null);
});

test("buildOlxListingXml marks only the first gallery photo as primary", () => {
  const xml = buildOlxListingXml({ listing: baseListing(), city: LONDRINA });
  assert.match(xml, /<Item medium="image" caption="" primary="true">https:\/\/media\.imobiliarista\.net\/listings\/1\/cover-v1\.webp<\/Item>/);
  assert.match(xml, /<Item medium="image" caption="" primary="false">https:\/\/media\.imobiliarista\.net\/listings\/1\/gallery\/2\.webp<\/Item>/);
});

test("buildOlxListingXml includes a video Media item for a listing with a YouTube video", () => {
  const xml = buildOlxListingXml({ listing: baseListing({ video: { provider: "youtube", id: "abc123" } }), city: LONDRINA });
  assert.match(xml, /<Item medium="video" caption="">https:\/\/www\.youtube\.com\/watch\?v=abc123<\/Item>/);
});

test("buildOlxListingXml omits Latitude/Longitude when the listing has none", () => {
  const xml = buildOlxListingXml({ listing: baseListing(), city: LONDRINA });
  assert.doesNotMatch(xml, /Latitude/);
  assert.doesNotMatch(xml, /Longitude/);
});

test("buildOlxListingXml includes Latitude/Longitude when present", () => {
  const xml = buildOlxListingXml({
    listing: baseListing({ location: { city: "londrina", district: "Centro", latitude: -23.31, longitude: -51.16 } }),
    city: LONDRINA,
  });
  assert.match(xml, /<Latitude>-23\.31<\/Latitude>/);
  assert.match(xml, /<Longitude>-51\.16<\/Longitude>/);
});

test("buildOlxListingXml escapes title/description text that contains XML-special characters", () => {
  const xml = buildOlxListingXml({ listing: baseListing({ title: 'Casa & "Terreno" <top>' }), city: LONDRINA });
  assert.match(xml, /<Title>Casa &amp; &quot;Terreno&quot; &lt;top&gt;<\/Title>/);
});

// --- formatOlxFeed -------------------------------------------------------

const HEADER = {
  provider: "Imobiliarista",
  email: "contato@imobiliarista.net",
  contactName: "Imobiliarista",
  telephone: "11-30000000",
  publishDate: "2026-08-25T12:00:00.000Z",
};

test("formatOlxFeed wraps the Header + every Listing in the VRSync root element", () => {
  const xml = formatOlxFeed([{ listing: baseListing(), city: LONDRINA }], HEADER);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<ListingDataFeed xmlns="http:\/\/www\.vivareal\.com\/schemas\/1\.0\/VRSync"/);
  assert.match(xml, /<Provider>Imobiliarista<\/Provider>/);
  assert.match(xml, /<Email>contato@imobiliarista\.net<\/Email>/);
  assert.match(xml, /<Telephone>11-30000000<\/Telephone>/);
  assert.match(xml, /<Listings><Listing>/);
  assert.match(xml, /<\/Listings><\/ListingDataFeed>$/);
});

test("formatOlxFeed omits <Telephone> when the header has none", () => {
  const xml = formatOlxFeed([], { ...HEADER, telephone: null });
  assert.doesNotMatch(xml, /Telephone/);
});

test("formatOlxFeed silently excludes items an unmapped type disqualifies, keeping the rest", () => {
  const items = [
    { listing: baseListing({ slug: "ok-1" }), city: LONDRINA },
    { listing: baseListing({ slug: "bad-tipo", type: "tipo-inexistente" }), city: LONDRINA },
    { listing: baseListing({ slug: "ok-2" }), city: LONDRINA },
  ];
  const xml = formatOlxFeed(items, HEADER);
  assert.match(xml, /<ListingID>ok-1<\/ListingID>/);
  assert.match(xml, /<ListingID>ok-2<\/ListingID>/);
  assert.doesNotMatch(xml, /bad-tipo/);
});

test("formatOlxFeed produces a valid empty feed for zero items", () => {
  const xml = formatOlxFeed([], HEADER);
  assert.match(xml, /<Listings><\/Listings>/);
});
