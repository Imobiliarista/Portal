// business/catalogs.js
//
// Constrói os dois catálogos globais restantes do portal (§66, §90 Etapa 3):
// `portal/cities.json` e `portal/modules.json`. `portal/taxonomy.json` mora
// em `business/taxonomy.js` (era um placeholder já reservado para isso,
// §70) — este arquivo é novo porque não existia equivalente para
// cidades/módulos.
//
// Ambas as funções abaixo são puras: recebem os dados privados já
// resolvidos pelo chamador (o adapter oficial, §31/Etapa 4) em vez de ler
// R2 diretamente, para poderem ser testadas e usadas no planejamento em
// memória sem nenhum binding real — mesmo padrão de
// `business/publishing.js#normalizeListingForPublic`/`normalizeBrokerForPublic`
// (normalização pura, separada da gravação em `putPublic`).

/**
 * Constrói `portal/cities.json` (§66 — "slug, nome, UF, quantidade de
 * anúncios"). `cities` já vem resolvido pelo chamador como
 * `[{ slug, name, uf, totalListings }]`; esta função só ordena
 * deterministicamente (por slug, mesmo critério já usado por
 * `storage/indexes.js#registerCitySlug`) e normaliza o formato de saída —
 * não decide quais cidades entram (isso é responsabilidade do adapter, que
 * lê o registro `indexes/cities.json`).
 *
 * Uma cidade sem nenhum anúncio ativo continua aparecendo, com
 * `totalListings: 0` — mesma filosofia já estabelecida por
 * `city-manifest.schema.json`/`rebuildCity` (§77 "cidade sem anúncios ainda
 * publica um manifest vazio válido", nunca tratado como falha). Uma
 * instalação sem nenhuma cidade conhecida ainda produz um catálogo válido
 * com `cities: []` — não um 404 (Etapa 3, "estado vazio obrigatório").
 */
export function buildPortalCitiesCatalog(cities) {
  const sorted = [...cities].sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    schemaVersion: 1,
    cities: sorted.map((city) => ({
      slug: city.slug,
      name: city.name,
      uf: city.uf,
      totalListings: city.totalListings ?? 0,
    })),
  };
}

// Módulos public-facing (visitante do portal/minisite) que este lote expõe
// como habilitados. Deliberadamente NÃO inclui:
//   - "financial" (módulo administrativo/cobrança entre corretor e
//     plataforma — nunca visitante-facing, e expor até se está
//     ativo/inativo (`FINANCIAL_ENABLED`) seria vazar configuração
//     administrativa interna, proibido pela Etapa 3);
//   - "plans" (catálogo de planos comerciais do SuperAdmin, não uma feature
//     de portal);
//   - "pwa" (infraestrutura de entrega, não uma feature de produto que o
//     visitante liga/desliga).
// Cada entrada é só `{ id, enabled }` — nenhum dado de configuração,
// credencial ou flag interna (Etapa 3 "não exponha... flags internas").
// `enabled: true` para todos porque, hoje, nenhum desses módulos tem um
// interruptor global equivalente ao `FINANCIAL_ENABLED` do módulo
// financeiro — presença em `modules/` já significa "disponível". Se um
// módulo público ganhar um flag global no futuro, este arquivo é o único
// lugar que precisa mudar.
const PUBLIC_MODULES = Object.freeze([
  Object.freeze({ id: "appointments", enabled: true }),
  Object.freeze({ id: "comparison", enabled: true }),
  Object.freeze({ id: "financingCalculator", enabled: true }),
  Object.freeze({ id: "publications", enabled: true }),
  Object.freeze({ id: "savedSearch", enabled: true }),
  Object.freeze({ id: "tour360", enabled: true }),
  Object.freeze({ id: "videoYoutube", enabled: true }),
]);

/**
 * Constrói `portal/modules.json` — puro, sem argumentos, sem R2: a lista de
 * módulos públicos habilitados é hoje um dado estático do próprio código
 * (ver `PUBLIC_MODULES` acima), não algo lido de `IMOB_PRIVATE`.
 */
export function buildPortalModulesCatalog() {
  return {
    schemaVersion: 1,
    modules: PUBLIC_MODULES.map((entry) => ({ ...entry })),
  };
}
