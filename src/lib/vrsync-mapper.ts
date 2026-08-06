// Tabela de-para: taxonomia interna ↔ taxonomia VRSync (Grupo OLX)
// Conforme seção 4.11 do project.md

// Mapeamento de Tipo de Negócio (Venda/Locação) para VRSync
export function mapearTipoNegocioParaVRSync(tipoNegocioSlug: string): string {
  const mapa: Record<string, string> = {
    venda: "Venda",
    locacao: "Aluguel",
  };
  return mapa[tipoNegocioSlug.toLowerCase()] || tipoNegocioSlug;
}

// Mapeamento de Categoria de Imóvel para VRSync PropertyType
export function mapearCategoriaParaVRSync(categoriaSlug: string): string {
  const mapa: Record<string, string> = {
    residencial: "Residential",
    comercial: "Commercial",
    corporativo: "Commercial",
    industrial: "Commercial",
    rural: "Residential",
  };
  return mapa[categoriaSlug.toLowerCase()] || "Residential";
}

// Mapeamento de Tipo de Imóvel para VRSync UnitType
export function mapearTipoImovelParaVRSync(tipoImovelSlug: string): string {
  const mapa: Record<string, string> = {
    // Residencial
    apartamento: "Apartment",
    casa: "House",
    cobertura: "Penthouse",
    chacara: "House",
    terreno: "Land",
    area: "Land",

    // Comercial
    loja: "Shop",
    sala: "Office",
    predio: "Building",
    galpao: "Garage",
    barracao: "Garage",
    salao: "Office",

    // Rural
    fazenda: "Farm",
    sitio: "House",
  };
  return mapa[tipoImovelSlug.toLowerCase()] || "Residential";
}

// Valida campos obrigatórios por tipo de imóvel (conforme seção 4.11)
export function validarCamposObrigatorios(
  tipoImovelSlug: string,
  dados: {
    area_total?: number;
    area_util?: number;
    quartos?: number;
    banheiros?: number;
  }
): { valido: boolean; erro?: string } {
  const tipo = tipoImovelSlug.toLowerCase();

  // Área Total: obrigatória para Terreno, Fazenda, Sítio, Chácara
  const requerAreaTotal = ["terreno", "area", "fazenda", "sitio", "chacara"];
  if (requerAreaTotal.includes(tipo) && !dados.area_total) {
    return { valido: false, erro: `Área Total obrigatória para ${tipo}` };
  }

  // Área Útil: obrigatória para demais tipos (residencial que não seja terreno)
  const requerAreaUtil = ![
    "terreno",
    "area",
    "fazenda",
    "sitio",
    "chacara",
  ].includes(tipo);
  if (requerAreaUtil && !dados.area_util) {
    return { valido: false, erro: `Área Útil obrigatória para ${tipo}` };
  }

  // Dormitórios: obrigatório para imóveis residenciais
  const residencialTypes = [
    "apartamento",
    "casa",
    "cobertura",
    "chacara",
    "sitio",
  ];
  if (residencialTypes.includes(tipo) && !dados.quartos) {
    return { valido: false, erro: `Dormitórios obrigatório para ${tipo}` };
  }

  // Banheiro: obrigatório, exceto Lote/Terreno/Área
  const semBanheiro = ["terreno", "area", "lote"];
  if (!semBanheiro.includes(tipo) && dados.banheiros === undefined) {
    return { valido: false, erro: `Banheiro obrigatório para ${tipo}` };
  }

  return { valido: true };
}
