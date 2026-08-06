// Módulo de Comparação de Anúncios — Lote 12.8
// Seção 2.1 do project.md
// Comparação entre 2-3 anúncios lado a lado — 100% client-side

// Validação simples de IDs de anúncios
export function validarIdsAnuncios(ids: unknown): boolean {
  if (!Array.isArray(ids)) {
    return false;
  }

  // Máximo 3 anúncios
  if (ids.length > 3 || ids.length < 2) {
    return false;
  }

  // Todos devem ser números (IDs inteiros)
  return ids.every((id) => typeof id === "number" && id > 0);
}

// Atributos padrão exibidos na comparação
export const ATRIBUTOS_PADRAO = [
  { chave: "precoVenda", label: "Preço (Venda)", tipo: "preco" },
  { chave: "precoLocacao", label: "Preço (Locação)", tipo: "preco" },
  { chave: "areaTil", label: "Área Útil (m²)", tipo: "numero" },
  { chave: "areaTotal", label: "Área Total (m²)", tipo: "numero" },
  { chave: "quartos", label: "Quartos", tipo: "numero" },
  { chave: "banheiros", label: "Banheiros", tipo: "numero" },
  { chave: "vagas", label: "Vagas", tipo: "numero" },
  { chave: "condominio", label: "Condomínio (R$)", tipo: "preco" },
  { chave: "iptu", label: "IPTU (R$)", tipo: "preco" },
  { chave: "bairro", label: "Bairro", tipo: "texto" },
];

// Formata valor de preço para exibição
export function formatarPreco(valor: number | null | undefined): string {
  if (!valor) {
    return "—";
  }
  return `R$ ${valor.toLocaleString("pt-BR")}`;
}

// Formata valor numérico simples
export function formatarNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) {
    return "—";
  }
  return valor.toString();
}
