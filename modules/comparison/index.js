// modules/comparison/index.js
//
// Módulo comparison (§45) — ponto de entrada. §45 é três frases ("Client-side.
// Browser compara JSONs já carregados. Não precisa Worker.") — o resto (onde
// a seleção fica guardada entre navegações, quantos imóveis cabem lado a
// lado, quais campos entram na grade) é decisão deste lote, documentada em
// modules/comparison/README.md.
//
// Os JSONs comparados são os mesmos `listings/{slug}.json`
// (schemas/listing-public.schema.json, §15) que frontend/portal/data.js já
// busca para a página de imóvel completo — nenhum formato novo. A seleção
// em si (quais slugs estão "em comparação" agora) é estado do visitante, não
// do corretor/portal, então vive em `localStorage`, nunca em R2 (§45 diz
// "sem Worker" — persistir isso em R2/KV exigiria uma rota nova, o que o
// documento explicitamente descarta).
//
// Como o browser só alcança `frontend/` (Static Assets — wrangler.toml
// `[assets] directory = "frontend"`; mesma restrição documentada em
// modules/pwa/README.md, modules/tour-360/README.md e
// modules/publications/README.md), este arquivo não é importado
// diretamente pelo frontend. `renderFrontendModuleSource` embute
// (`.toString()`, nunca redigitado) as funções abaixo — testadas aqui em
// Node — num ESM standalone que scripts/generate-comparison-assets.js grava
// em frontend/shared/comparison.generated.js (Static Asset real). A
// formatação de exibição (preço em BRL, m², rótulos de finalidade) fica no
// componente de UI (frontend/portal/components/comparison.js), que já roda
// dentro de frontend/ e pode importar frontend/portal/render.js direto —
// não faz sentido duplicar `formatPrice`/`formatArea` aqui só para poder
// embutir no bundle gerado.

export const COMPARISON_STORAGE_KEY = "imob:comparison";

/** Quantos imóveis cabem lado a lado antes da grade virar ilegível/exigir scroll horizontal excessivo — decisão deste lote, ver README. */
export const MAX_COMPARISON_ITEMS = 4;

/** `storage` explícito (testes) ou `localStorage` do browser; `null` se nenhum dos dois existir (SSR/Node sem injeção) — chamadores tratam `null` como "sem persistência", nunca lançam. */
function resolveStorage(storage) {
  if (storage) return storage;
  return typeof localStorage !== "undefined" ? localStorage : null;
}

/**
 * Lê a lista de slugs em comparação. Tolerante a `localStorage`
 * ausente/indisponível (Safari privado, cota excedida, `storage` nulo em
 * teste) e a conteúdo corrompido/adulterado — sempre devolve um array de
 * strings, nunca lança.
 */
export function readComparisonSlugs(storage) {
  const store = resolveStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(COMPARISON_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((slug) => typeof slug === "string" && slug.length > 0);
  } catch {
    return [];
  }
}

/** Grava a lista de slugs em comparação (substitui, não faz merge). Falha em silêncio se `storage` estiver indisponível/cheio. */
export function writeComparisonSlugs(slugs, storage) {
  const store = resolveStorage(storage);
  if (!store) return;
  const clean = Array.isArray(slugs) ? slugs.filter((slug) => typeof slug === "string" && slug.length > 0) : [];
  try {
    store.setItem(COMPARISON_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // localStorage indisponível/cota excedida — a seleção só não persiste, nada quebra
  }
}

/** Esvazia a seleção (botão "Limpar" da barra de comparação). */
export function clearComparisonSlugs(storage) {
  writeComparisonSlugs([], storage);
}

export function isInComparison(slugs, slug) {
  return Array.isArray(slugs) && slugs.includes(slug);
}

/**
 * Alterna um slug na seleção: remove se já estiver presente, adiciona se
 * não estiver (respeitando `MAX_COMPARISON_ITEMS`). Devolve a lista
 * resultante mais `{ added, atLimit }` para a UI decidir o que mostrar —
 * `atLimit: true` quando a adição foi recusada por já haver
 * `MAX_COMPARISON_ITEMS` imóveis selecionados (a seleção existente não é
 * alterada nesse caso). Entrada inválida (`slug` não-string/vazio) é
 * no-op, nunca lança.
 */
export function toggleComparisonSlug(slug, storage) {
  const current = readComparisonSlugs(storage);
  if (typeof slug !== "string" || !slug) return { slugs: current, added: false };

  if (current.includes(slug)) {
    const next = current.filter((item) => item !== slug);
    writeComparisonSlugs(next, storage);
    return { slugs: next, added: false };
  }

  if (current.length >= MAX_COMPARISON_ITEMS) {
    return { slugs: current, added: false, atLimit: true };
  }

  const next = [...current, slug];
  writeComparisonSlugs(next, storage);
  return { slugs: next, added: true };
}

/**
 * Monta as linhas da grade comparativa a partir de imóveis completos
 * (listing-public.schema.json, §15) já carregados pelo Browser — os
 * mesmos campos que `frontend/portal/render.js#listingViewModel` já expõe
 * na página de imóvel completo, na mesma ordem em que aparecem lá: preço,
 * condomínio, IPTU, localização, quartos/banheiros/vagas/área. Cada linha
 * é `{ key, label, values }`, com `values[i]` correspondendo a
 * `listings[i]` (valor bruto — número/string/`null` — nunca formatado; a
 * formatação de exibição é responsabilidade de quem renderiza, ver header
 * do arquivo). Um item ausente/inválido em `listings` vira uma coluna de
 * `null`s — nunca lança.
 */
export function buildComparisonRows(listings) {
  const items = Array.isArray(listings) ? listings : [];
  const rows = [
    { key: "purpose", label: "Finalidade", get: (l) => l.purpose ?? null },
    { key: "type", label: "Tipo", get: (l) => l.type ?? null },
    { key: "price", label: "Preço", get: (l) => (typeof l.price === "number" ? l.price : null) },
    { key: "condominium", label: "Condomínio", get: (l) => (typeof l.condominium === "number" ? l.condominium : null) },
    { key: "iptu", label: "IPTU", get: (l) => (typeof l.iptu === "number" ? l.iptu : null) },
    { key: "city", label: "Cidade", get: (l) => l.location?.city ?? null },
    { key: "district", label: "Bairro", get: (l) => l.location?.district ?? null },
    { key: "bedrooms", label: "Quartos", get: (l) => (typeof l.features?.bedrooms === "number" ? l.features.bedrooms : null) },
    { key: "bathrooms", label: "Banheiros", get: (l) => (typeof l.features?.bathrooms === "number" ? l.features.bathrooms : null) },
    { key: "parkingSpaces", label: "Vagas", get: (l) => (typeof l.features?.parkingSpaces === "number" ? l.features.parkingSpaces : null) },
    { key: "area", label: "Área", get: (l) => (typeof l.features?.area === "number" ? l.features.area : null) },
  ];
  return rows.map(({ key, label, get }) => ({
    key,
    label,
    values: items.map((listing) => get(listing ?? {})),
  }));
}

/**
 * Gera o texto completo (standalone ESM, sem imports) de
 * frontend/shared/comparison.generated.js. Mesmo padrão de
 * modules/tour-360/index.js#renderFrontendModuleSource: o código testado
 * aqui em Node é literalmente o que roda no browser.
 */
export function renderFrontendModuleSource() {
  return `// frontend/shared/comparison.generated.js
//
// GERADO por scripts/generate-comparison-assets.js a partir de
// modules/comparison/index.js — não editar à mão (§45, módulo comparison).
// Regenerar com: npm run generate:comparison

export const COMPARISON_STORAGE_KEY = ${JSON.stringify(COMPARISON_STORAGE_KEY)};
export const MAX_COMPARISON_ITEMS = ${JSON.stringify(MAX_COMPARISON_ITEMS)};

${resolveStorage.toString()}

export ${readComparisonSlugs.toString()}

export ${writeComparisonSlugs.toString()}

export ${clearComparisonSlugs.toString()}

export ${isInComparison.toString()}

export ${toggleComparisonSlug.toString()}

export ${buildComparisonRows.toString()}
`;
}
