// frontend/shared/comparison.generated.js
//
// GERADO por scripts/generate-comparison-assets.js a partir de
// modules/comparison/index.js — não editar à mão (§45, módulo comparison).
// Regenerar com: npm run generate:comparison

export const COMPARISON_STORAGE_KEY = "imob:comparison";
export const MAX_COMPARISON_ITEMS = 4;

function resolveStorage(storage) {
  if (storage) return storage;
  return typeof localStorage !== "undefined" ? localStorage : null;
}

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

export function clearComparisonSlugs(storage) {
  writeComparisonSlugs([], storage);
}

export function isInComparison(slugs, slug) {
  return Array.isArray(slugs) && slugs.includes(slug);
}

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
