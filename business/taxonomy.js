// business/taxonomy.js
//
// Constrói `portal/taxonomy.json` (§65 — schemas/taxonomy.schema.json),
// deixando de ser placeholder (§70) para hospedar a única lógica de domínio
// que este catálogo precisa: nenhuma delas depende de R2 PRIVATE, então o
// gerador inteiro é puro e determinístico.
//
// §65 pede exatamente "tipos, finalidades, características, faixas" —
// `types`/`purposes`/`features`/`priceRanges` abaixo. Nenhum valor aqui foi
// copiado do ACTS; cada lista é derivada do que o próprio projeto já usa:
//
// - `purposes` reaproveita `business/listings.js#PURPOSES` (o enum real que
//   `createListing`/`updateListing` aceitam) — nunca um enum duplicado à
//   mão que pudesse divergir.
// - `types` reaproveita as chaves de
//   `modules/feeds/formatters/vrsync.js#PROPERTY_TYPE_BY_LISTING_TYPE` — o
//   único lugar do código que já enumera valores reais de `listing.type`
//   (comentário daquele arquivo: "o projeto não tem taxonomia fechada
//   ainda... só cobre os valores que os testes/fixtures deste projeto já
//   usam"). `type` continua texto livre em `business/listings.js` — esta
//   lista é o vocabulário inicial exposto ao frontend como filtro sugerido,
//   não uma validação server-side nova.
// - `features` reaproveita as dimensões de filtro que
//   `frontend/portal/filters.js#filterCards` já implementa
//   (`bedroomsMin`/`bathroomsMin`/`parkingSpacesMin`/`areaMin`/`areaMax`) —
//   os rótulos descrevem exatamente esses campos.
// - `priceRanges` é o único campo sem nenhum precedente no código (nenhuma
//   faixa de preço é validada ou filtrada em lugar nenhum hoje) — um valor
//   inicial razoável para o mercado imobiliário brasileiro, sinalizado
//   explicitamente como ajustável por produto depois (ver
//   docs/CHANGELOG.md), não um contrato travado.

import { PURPOSES } from "./listings.js";
import { PROPERTY_TYPE_BY_LISTING_TYPE } from "../modules/feeds/formatters/vrsync.js";

const PURPOSE_LABELS = Object.freeze({ venda: "Venda", aluguel: "Aluguel" });

// Subconjunto canônico (deduplicado) das chaves de
// PROPERTY_TYPE_BY_LISTING_TYPE — a tabela original tem sinônimos
// deliberados para o mapeamento de feed (ex.: "sala"/"sala-comercial",
// "galpao"/"galpão") que não fazem sentido como duas opções de filtro
// distintas; aqui cada `type` real vira uma única opção rotulada.
const TYPE_LABELS = Object.freeze({
  apartamento: "Apartamento",
  casa: "Casa",
  "casa-condominio": "Casa em Condomínio",
  cobertura: "Cobertura",
  galpao: "Galpão",
  kitnet: "Kitnet",
  loja: "Loja",
  lote: "Lote",
  "sala-comercial": "Sala Comercial",
  studio: "Studio",
  terreno: "Terreno",
});

const FEATURE_LABELS = Object.freeze({
  bedrooms: "Quartos",
  bathrooms: "Banheiros",
  parkingSpaces: "Vagas de garagem",
  area: "Área (m²)",
});

// Sem precedente no código (ver header) — faixas iniciais, ajustáveis por
// produto sem exigir mudança de schema ou de contrato de chave.
const PRICE_RANGES = Object.freeze([
  Object.freeze({ id: "ate-300k", label: "Até R$ 300 mil", min: 0, max: 300_000 }),
  Object.freeze({ id: "300k-600k", label: "R$ 300 mil a R$ 600 mil", min: 300_000, max: 600_000 }),
  Object.freeze({ id: "600k-1m", label: "R$ 600 mil a R$ 1 milhão", min: 600_000, max: 1_000_000 }),
  Object.freeze({ id: "acima-1m", label: "Acima de R$ 1 milhão", min: 1_000_000, max: null }),
]);

function labeledOptions(labelsById) {
  return Object.keys(labelsById)
    .sort()
    .map((id) => ({ id, label: labelsById[id] }));
}

/**
 * Constrói `portal/taxonomy.json` (schemas/taxonomy.schema.json) — puro,
 * sem R2, sem argumentos: nada aqui depende de estado privado, então o
 * resultado é sempre idêntico byte-a-byte entre execuções (idempotência,
 * Etapa 3).
 */
export function buildPortalTaxonomy() {
  return {
    schemaVersion: 1,
    types: labeledOptions(TYPE_LABELS),
    purposes: PURPOSES.map((id) => ({ id, label: PURPOSE_LABELS[id] ?? id })),
    features: labeledOptions(FEATURE_LABELS),
    priceRanges: PRICE_RANGES.map((range) => ({ ...range })),
  };
}
