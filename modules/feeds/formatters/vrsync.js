// modules/feeds/formatters/vrsync.js
//
// Submódulo "Modo Exportação" -> vrsync (§46) — o formato compartilhado
// por OLX, ZAP e VivaReal (todos Grupo OLX hoje): um único XML cobre os
// três, decisão de produto confirmada (nenhum arquivo por portal, nenhum
// arquivo por corretor — um arquivo agrega todos os corretores que
// ligaram este submódulo). Pure function: recebe `items` já filtrados por
// modules/feeds/generator.js#collectFeedItems (publicado, corretor ativo,
// submódulo vrsync habilitado) e devolve a string XML. Nenhum acesso a
// R2/business aqui — mesma separação de business/cards.js (projeção pura,
// testável com fixtures).
//
// --- fonte -------------------------------------------------------------
//
// A estrutura raiz (`ListingDataFeed`/`Header`/`Listings`/`Listing`) e a
// lista EXATA de campos a mapear (ListingID, Title, TransactionType,
// Media, ListPrice/RentalPrice, PropertyType, PostalCode,
// LivingArea/LotArea) vieram diretamente do solicitante nesta etapa —
// não foram reconstruídas via busca. A doc oficial completa
// (developers.grupozap.com/feeds/vrsync/elements/) continua bloqueada
// para esta sessão (EGRESS_BLOCKED); dois campos que o solicitante pediu
// para confirmar "na doc" tiveram que ser resolvidos via WebSearch (com
// snippet citando um exemplo real, não a página em si) por falta de
// acesso: o item de vídeo em `<Media>` e os valores de `PropertyType`.
// Ver modules/feeds/README.md#decisões para as buscas exatas e o que
// ficou como pendência de verificação.
//
// Deliberadamente MENOR que o campo-set completo do VRSync que uma busca
// anterior (lote passado, quando o formato ainda era pensado como
// "OLX" isolado) sugeriu existir (Location/Neighborhood/City/State,
// Bedrooms/Bathrooms/Garage) — a lista de campos que o solicitante deu
// nesta etapa é explícita e não inclui esses; ver README#decisões para o
// porquê de não adicioná-los por conta própria.

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
const VRSYNC_NAMESPACE = "http://www.vivareal.com/schemas/1.0/VRSync";
const VRSYNC_SCHEMA_LOCATION = `${VRSYNC_NAMESPACE} http://xml.vivareal.com/vrsync.xsd`;

/**
 * `listing.type` (business/listings.js) é texto livre — o projeto não tem
 * taxonomia fechada ainda (business/taxonomy.js é placeholder, §70). Esta
 * tabela só cobre os valores que os testes/fixtures deste projeto já
 * usam — NÃO é transcrição do enum completo de `PropertyType` (busca não
 * achou a lista inteira, ver README). Um `type` fora daqui exclui o
 * anúncio do feed (`buildVrsyncListingXml` retorna `null`) em vez de
 * inventar um valor.
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

/** PropertyTypes cuja área é reportada em `<LotArea>` em vez de `<LivingArea>` — terrenos/lotes, per solicitação ("LivingArea] ou [LotArea] (terrenos/fazendas)"). Só "Residential/Land" está no mapa confirmado acima — "fazenda"/"sítio" ficaria aqui também se algum dia entrar na tabela de PropertyType. */
const LOT_AREA_PROPERTY_TYPES = new Set(["Residential/Land"]);

function normalizeTypeKey(type) {
  return String(type ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents (á -> a, ã -> a, ...)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/** `listing.type` -> VRSync `PropertyType`, ou `null` se não mapeado (ver tabela acima). */
export function mapListingTypeToPropertyType(type) {
  return PROPERTY_TYPE_BY_LISTING_TYPE[normalizeTypeKey(type)] ?? null;
}

/** `listing.purpose` ("venda"/"aluguel", único enum do schema) -> VRSync `TransactionType`. */
export function mapPurposeToTransactionType(purpose) {
  return purpose === "aluguel" ? "For Rent" : "For Sale";
}

const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

/** Escapa texto para conteúdo/atributo XML. Entrada não-string é convertida antes. */
export function escapeXmlText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

/** Envolve texto em CDATA, neutralizando a única sequência (`]]>`) que encerraria a seção cedo demais. */
export function cdata(value) {
  return `<![CDATA[${String(value ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function buildPriceTag(transactionType, price) {
  return transactionType === "For Rent"
    ? `<RentalPrice currency="BRL">${Math.round(price)}</RentalPrice>`
    : `<ListPrice currency="BRL">${Math.round(price)}</ListPrice>`;
}

function buildAreaTag(propertyType, area) {
  const tagName = LOT_AREA_PROPERTY_TYPES.has(propertyType) ? "LotArea" : "LivingArea";
  return `<${tagName}>${area}</${tagName}>`;
}

/**
 * `<Media>` — fotos (`listing.gallery`, R2 MEDIA) + vídeo (`listing.video`,
 * YouTube, já existe desde a Etapa 3). Primeira foto marcada
 * `primary="true"` (mesma convenção de `business/cards.js#buildListingCard`,
 * onde `gallery[0]` já é a capa) — as demais não recebem o atributo
 * `primary` (a doc não mostrou um exemplo com `primary="false"` explícito,
 * só a ausência do atributo pro caso não-principal). O item de vídeo
 * (`medium="video"`, URL do YouTube como conteúdo) foi confirmado via
 * WebSearch com um exemplo citado literalmente — ver README — não a
 * página oficial em si.
 */
function buildMediaTag(listing) {
  const images = (listing.gallery ?? []).map(
    (url, index) => `<Item medium="image"${index === 0 ? ' primary="true"' : ""}>${escapeXmlText(url)}</Item>`,
  );
  const video =
    listing.video?.provider === "youtube" && listing.video.id
      ? [`<Item medium="video">${escapeXmlText(`https://www.youtube.com/watch?v=${listing.video.id}`)}</Item>`]
      : [];
  const items = [...images, ...video];
  return items.length > 0 ? `<Media>${items.join("")}</Media>` : "<Media></Media>";
}

/**
 * Builds one `<Listing>` from `{ listing, listingId }` — `listing` é
 * listing-public.schema.json, `listingId` é o id PRIVADO
 * (`business/listings.js`, ex. `listing_<uuid>`) — não `listing.slug`. O
 * solicitante foi explícito: "ListingID = listingId interno" (1 a 50
 * caracteres — `listing_` + UUID = 44, cabe). `listing-public.schema.json`
 * nunca carrega esse id (só `slug`), então quem monta o item
 * (`modules/feeds/generator.js#collectFeedItems`) precisa anexá-lo — é o
 * mesmo id que já está em mãos no laço sobre
 * `storage/indexes.js#getBrokerListingIds`.
 *
 * Retorna `null` (o chamador filtra) quando o anúncio não pode ser
 * representado: `type` sem mapeamento conhecido
 * (`mapListingTypeToPropertyType`) ou sem `location.zipcode` — PostalCode
 * é obrigatório na especificação (decisão do solicitante: anúncio sem
 * CEP fica de fora do feed, documentado como pendência de dado
 * incompleto, nunca uma tag vazia/inventada).
 */
export function buildVrsyncListingXml({ listing, listingId }) {
  const propertyType = mapListingTypeToPropertyType(listing.type);
  if (!propertyType) return null;
  if (!listing.location?.zipcode) return null;

  const transactionType = mapPurposeToTransactionType(listing.purpose);

  return [
    "<Listing>",
    `<ListingID>${escapeXmlText(listingId)}</ListingID>`,
    `<Title>${cdata(listing.title)}</Title>`,
    `<TransactionType>${transactionType}</TransactionType>`,
    buildMediaTag(listing),
    "<Details>",
    `<Description>${cdata(listing.description)}</Description>`,
    buildPriceTag(transactionType, listing.price),
    `<PropertyType>${propertyType}</PropertyType>`,
    `<PostalCode>${escapeXmlText(listing.location.zipcode)}</PostalCode>`,
    buildAreaTag(propertyType, listing.features.area),
    "</Details>",
    "</Listing>",
  ].join("");
}

/**
 * Builds the complete `feeds/vrsync.xml` document from `items`
 * (`{ listing, listingId }[]`, já filtrados por
 * modules/feeds/generator.js#collectFeedItems) e `header`
 * (`{ provider, email, contactName, telephone, publishDate }`, ver
 * modules/feeds/generator.js#buildFeedHeader). Itens cujo `type`/`zipcode`
 * desqualificam são excluídos silenciosamente (ver
 * `buildVrsyncListingXml`) — nunca lança por causa de um anúncio ruim;
 * mesma postura "conteúdo tolerante" que outros módulos desta etapa já
 * usam para não deixar um corretor com dado incompleto derrubar o feed
 * inteiro de todos os outros.
 */
export function generateVrsyncFeed(items, header) {
  const listingsXml = items
    .map((item) => buildVrsyncListingXml(item))
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
