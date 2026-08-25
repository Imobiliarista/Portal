// modules/feeds/formatters/olx.js
//
// Módulo feeds (§46) — formatter OLX. Pure function: takes items already
// resolved by modules/feeds/generator.js ({ listing: listing-public.schema.json,
// broker: broker.schema.json private record, city: { name, uf } }) and
// returns an XML string. No R2/business access here — same separation
// business/cards.js already uses for listing-public -> card/index-entry
// mappings (pure, trivially unit-testable with fixtures).
//
// --- formato: VRSync -------------------------------------------------------
//
// OLX Imóveis and ZAP/VivaReal are both owned by Grupo OLX and share one
// XML feed format, "VRSync" (namespace
// http://www.vivareal.com/schemas/1.0/VRSync). This is why §46 lists
// formatters/olx.js and formatters/zap.js side by side — a future zap.js
// would very likely reuse most of what's here rather than being a
// different schema from scratch (out of scope this lot — see README
// pendências).
//
// The official reference is
// https://developers.olx.com.br/anuncio/xml/real_estate/home.html
// (and, for the shared format, https://developers.grupozap.com/feeds/vrsync/) —
// **this session's network egress could not reach either domain**
// (blocked by the environment's proxy; every WebFetch attempt returned
// EGRESS_BLOCKED). Everything below was reconstructed from Google search
// result snippets of those same pages (element names, attributes and one
// full example were quoted verbatim in the snippets) — see
// modules/feeds/README.md for the exact queries/sources and, importantly,
// the list of fields this file could NOT verify against the real page and
// therefore left out rather than guess. Before this feed is submitted to
// OLX's Canal Pro for real, re-fetch the official page from an
// unrestricted network and diff it against this file.

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
const VRSYNC_NAMESPACE = "http://www.vivareal.com/schemas/1.0/VRSync";
const VRSYNC_SCHEMA_LOCATION = `${VRSYNC_NAMESPACE} http://xml.vivareal.com/vrsync.xsd`;

const PORTAL_ORIGIN = "https://imobiliarista.net"; // §18 — same fixed-domain convention as worker/uploads.js#MEDIA_BASE_URL

/**
 * `listing.type` (business/listings.js) is free text — the project has no
 * closed taxonomy yet (business/taxonomy.js is still a placeholder, §70).
 * This table only covers the values this codebase's own fixtures/tests use
 * plus a few unambiguous synonyms; it is NOT a transcription of OLX's full
 * enum (blocked network access, see header). A `type` not listed here maps
 * to `null` and `buildOlxListingXml` excludes that listing rather than
 * send a `PropertyType` OLX might reject the whole feed for (see
 * `mapListingTypeToPropertyType`).
 */
export const PROPERTY_TYPE_BY_LISTING_TYPE = Object.freeze({
  apartamento: "Residential/Apartment",
  casa: "Residential/Home",
  "casa-condominio": "Residential/Condominium",
  "casa-de-condominio": "Residential/Condominium",
  cobertura: "Residential/Penthouse",
  kitnet: "Residential/Studio",
  studio: "Residential/Studio",
  terreno: "Residential/Land",
  lote: "Residential/Land",
  "sala-comercial": "Commercial/Office",
  sala: "Commercial/Office",
  loja: "Commercial/Store",
  galpao: "Commercial/Warehouse",
  "galpão": "Commercial/Warehouse",
});

/** Normalizes `listing.type` (accents/case/spacing) before the table lookup above. */
function normalizeTypeKey(type) {
  return String(type ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents (á -> a, ã -> a, ...)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/** `listing.type` -> VRSync `PropertyType`, or `null` when unmapped (see table's header comment). */
export function mapListingTypeToPropertyType(type) {
  return PROPERTY_TYPE_BY_LISTING_TYPE[normalizeTypeKey(type)] ?? null;
}

/** `listing.purpose` ("venda"/"aluguel", the only two values the schema enum allows) -> VRSync `TransactionType`. */
export function mapPurposeToTransactionType(purpose) {
  return purpose === "aluguel" ? "For Rent" : "For Sale";
}

const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

/** Escapes text for use as XML element/attribute content. Non-string input is stringified first. */
export function escapeXmlText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

/** Wraps text in a CDATA section, splitting the one sequence (`]]>`) that would otherwise terminate it early. */
export function cdata(value) {
  return `<![CDATA[${String(value ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/** listings/{slug}.json's public URL (§18 "/imovel/{slug}"), used for VRSync's `DetailViewUrl`. */
export function buildListingDetailUrl(listingSlug) {
  return `${PORTAL_ORIGIN}/imovel/${encodeURIComponent(listingSlug)}`;
}

function buildPriceTag(transactionType, price) {
  return transactionType === "For Rent"
    ? `<RentalPrice currency="BRL" period="Monthly">${Math.round(price)}</RentalPrice>`
    : `<ListPrice currency="BRL">${Math.round(price)}</ListPrice>`;
}

function buildLocationTag(listing, city) {
  const parts = [
    "<Country>Brazil</Country>",
    `<State>${escapeXmlText(city.uf)}</State>`,
    `<City>${escapeXmlText(city.name)}</City>`,
    `<Neighborhood>${escapeXmlText(listing.location.district)}</Neighborhood>`,
  ];
  if (typeof listing.location.latitude === "number") parts.push(`<Latitude>${listing.location.latitude}</Latitude>`);
  if (typeof listing.location.longitude === "number") parts.push(`<Longitude>${listing.location.longitude}</Longitude>`);
  // displayAddress="Neighborhood": the project's listing-public.schema.json
  // has no street/number/postal-code fields at all (§30/§15 never asked
  // for them) — see README pendências. Asking OLX to display down to
  // neighborhood level, instead of a full street address it was never
  // given, is the honest option given the data actually available, not a
  // guess at a field we can't populate.
  return `<Location displayAddress="Neighborhood">${parts.join("")}</Location>`;
}

function buildMediaTag(listing) {
  const images = (listing.gallery ?? []).map(
    (url, index) => `<Item medium="image" caption="" primary="${index === 0 ? "true" : "false"}">${escapeXmlText(url)}</Item>`,
  );
  const video = listing.video?.provider === "youtube" && listing.video.id
    ? [`<Item medium="video" caption="">${escapeXmlText(`https://www.youtube.com/watch?v=${listing.video.id}`)}</Item>`]
    : [];
  const items = [...images, ...video];
  return items.length > 0 ? `<Media>${items.join("")}</Media>` : "<Media></Media>";
}

/**
 * Builds one `<Listing>` element from `{ listing, city }` — `listing` is a
 * full listing-public.schema.json object, `city` is `{ name, uf }`
 * (business/cities.js#getCityBySlug). Returns `null` when the listing
 * can't be represented (currently: only an unmapped `type` — see
 * `mapListingTypeToPropertyType`), so the caller filters it out rather
 * than emit a `<Listing>` OLX would reject.
 */
export function buildOlxListingXml({ listing, city }) {
  const propertyType = mapListingTypeToPropertyType(listing.type);
  if (!propertyType) return null;

  const transactionType = mapPurposeToTransactionType(listing.purpose);

  return [
    "<Listing>",
    `<ListingID>${escapeXmlText(listing.slug)}</ListingID>`,
    `<Title>${escapeXmlText(listing.title)}</Title>`,
    `<TransactionType>${transactionType}</TransactionType>`,
    "<PublicationType>STANDARD</PublicationType>",
    `<DetailViewUrl>${escapeXmlText(buildListingDetailUrl(listing.slug))}</DetailViewUrl>`,
    "<Details>",
    `<PropertyType>${propertyType}</PropertyType>`,
    `<Description>${cdata(listing.description)}</Description>`,
    buildPriceTag(transactionType, listing.price),
    `<LivingArea unit="square meters">${listing.features.area}</LivingArea>`,
    `<Bedrooms>${listing.features.bedrooms}</Bedrooms>`,
    `<Bathrooms>${listing.features.bathrooms}</Bathrooms>`,
    `<Garage>${listing.features.parkingSpaces}</Garage>`,
    "</Details>",
    buildLocationTag(listing, city),
    buildMediaTag(listing),
    "</Listing>",
  ].join("");
}

/**
 * Builds the complete `feeds/olx.xml` document from `items`
 * (`{ listing, city }[]`, already filtered to active/published/opted-in by
 * modules/feeds/generator.js#collectFeedItems) and `header`
 * (`{ provider, email, contactName, telephone }`, see
 * modules/feeds/generator.js#buildFeedHeader). Items whose `type` doesn't
 * map to a `PropertyType` are silently excluded (see
 * `buildOlxListingXml`) — never throws on a single bad listing, matches
 * the "conteúdo de terceiro tolerante" posture already used by
 * modules/publications' feed parser for the same reason (one broker's bad
 * data shouldn't break every other broker's feed entry).
 */
export function formatOlxFeed(items, header) {
  const listingsXml = items
    .map((item) => buildOlxListingXml(item))
    .filter((xml) => xml !== null)
    .join("");

  const headerXml = [
    "<Header>",
    `<Provider>${escapeXmlText(header.provider)}</Provider>`,
    `<Email>${escapeXmlText(header.email)}</Email>`,
    `<ContactName>${escapeXmlText(header.contactName)}</ContactName>`,
    `<PublishDate>${escapeXmlText(header.publishDate)}</PublishDate>`,
    ...(header.telephone ? [`<Telephone>${escapeXmlText(header.telephone)}</Telephone>`] : []),
    "</Header>",
  ].join("");

  return (
    `${XML_DECLARATION}\n` +
    `<ListingDataFeed xmlns="${VRSYNC_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${VRSYNC_SCHEMA_LOCATION}">` +
    headerXml +
    `<Listings>${listingsXml}</Listings>` +
    "</ListingDataFeed>"
  );
}
