// Taxonomia de referência (tipos de negócio, categorias→tipos de imóvel,
// cidades) pro formulário de anúncio do painel do corretor — seção 5.3 e
// 5.4 do project.md. Tabelas de leitura, iguais pra qualquer corretor,
// sem filtro por sessão além da autenticação já exigida pela rota.

export interface TipoNegocioTaxonomia {
  id: number;
  nome: string;
  slug: string;
}

export interface TipoImovelTaxonomia {
  id: number;
  nome: string;
  slug: string;
}

export interface CategoriaTaxonomia {
  id: number;
  nome: string;
  slug: string;
  tipos_imovel: TipoImovelTaxonomia[];
}

export interface CidadeTaxonomia {
  id: number;
  nome: string;
  uf: string;
}

export interface Taxonomia {
  tipos_negocio: TipoNegocioTaxonomia[];
  categorias: CategoriaTaxonomia[];
  cidades: CidadeTaxonomia[];
}

export async function buscarTaxonomiaCompleta(db: D1Database): Promise<Taxonomia> {
  const [tiposNegocio, categorias, tiposImovel, cidades] = await Promise.all([
    db.prepare("SELECT id, nome, slug FROM tipos_negocio ORDER BY nome ASC").all(),
    db.prepare("SELECT id, nome, slug FROM categorias_imovel ORDER BY nome ASC").all(),
    db.prepare("SELECT id, nome, slug, categoria_id FROM tipos_imovel ORDER BY nome ASC").all(),
    db.prepare("SELECT id, nome, uf FROM cidades WHERE ativo = 1 ORDER BY nome ASC").all(),
  ]);

  const tiposPorCategoria = new Map<number, TipoImovelTaxonomia[]>();
  for (const t of (tiposImovel.results || []) as any[]) {
    const lista = tiposPorCategoria.get(t.categoria_id) || [];
    lista.push({ id: t.id, nome: t.nome, slug: t.slug });
    tiposPorCategoria.set(t.categoria_id, lista);
  }

  return {
    tipos_negocio: (tiposNegocio.results || []) as unknown as TipoNegocioTaxonomia[],
    categorias: ((categorias.results || []) as any[]).map((c) => ({
      id: c.id,
      nome: c.nome,
      slug: c.slug,
      tipos_imovel: tiposPorCategoria.get(c.id) || [],
    })),
    cidades: (cidades.results || []) as unknown as CidadeTaxonomia[],
  };
}
