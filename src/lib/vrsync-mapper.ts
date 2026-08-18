// Tabela de-para: taxonomia interna ↔ schema real do Grupo OLX (VRSync)
// Conforme seção 4.11 do project.md
//
// Substitui o mapa anterior (mapearTipoNegocioParaVRSync/mapearCategoriaParaVRSync/
// mapearTipoImovelParaVRSync), que devolvia strings em inglês inventadas
// ("Apartment", "House", "Residential") sem correspondência com nenhum
// schema real de portal brasileiro — achado raiz da reconstrução do feed.
// O schema real não tem tags separadas de TransactionType/PropertyType: o
// tipo de negócio já é implícito em qual tag de preço é emitida
// (PrecoVenda vs. PrecoLocacao, ver feeds/formatadores/vrsync-olx.ts), e
// SubTipoImovel cobre sozinho o que antes eram duas tags.

// Agrupamento fechado dos 21 valores de tipos_imovel.slug em 4 categorias
// (decisão registrada: Temporada/Aluguel de quartos ficam fora de escopo,
// não existe 5ª/6ª categoria pra isso). O código/string exato que o Grupo
// OLX espera por grupo não está confirmado numa documentação real — os
// valores abaixo são placeholder (`TBD_*`) até alguém confirmar contra a
// especificação oficial do Canal Pro antes deste feed ir pro ar de vez.
const GRUPOS_SUBTIPO_IMOVEL: Record<string, string[]> = {
  TBD_APARTAMENTOS: ["apartamento", "cobertura"],
  TBD_CASAS: ["casa", "chacara"],
  TBD_TERRENOS_SITIOS_FAZENDAS: ["terreno", "area", "sitio", "fazenda"],
  TBD_COMERCIO_INDUSTRIA: ["loja", "sala", "predio", "galpao", "barracao", "salao"],
};

export function mapearSubTipoImovel(tipoImovelSlug: string): string {
  const slug = tipoImovelSlug.toLowerCase();
  for (const [grupo, slugs] of Object.entries(GRUPOS_SUBTIPO_IMOVEL)) {
    if (slugs.includes(slug)) return grupo;
  }
  return "TBD_CASAS"; // fallback conservador — nunca deixa a tag vazia
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
