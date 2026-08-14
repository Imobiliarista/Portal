// Queries reutilizáveis para CRUD de anúncios via binding D1
// Conforme seção 5 e 6 do project.md

import { Anuncio } from "../types/modelos";

// ========== CREATE ==========

// Cria um novo anúncio
export async function criarAnuncio(
  db: D1Database,
  dados: {
    corretor_id: number;
    titulo: string;
    descricao?: string;
    preco_venda?: number;
    preco_aluguel?: number;
    tipo_negocio_id: number;
    categoria_imovel_id: number;
    tipo_imovel_id: number;
    cidade_id: number;
    bairro?: string;
    endereco_completo?: string;
    exibir_endereco_completo: boolean;
    area_total?: number;
    area_util?: number;
    quartos?: number;
    banheiros?: number;
    vagas_garagem?: number;
    cozinhas?: number;
    lavanderias?: number;
    fotos_json?: string;
    video_youtube_id?: string;
    tour_360_url?: string;
    slug: string;
  }
): Promise<number> {
  const agora = new Date().toISOString();

  const resultado = await db
    .prepare(
      `INSERT INTO anuncios (
        corretor_id, titulo, descricao, preco_venda, preco_aluguel,
        tipo_negocio_id, categoria_imovel_id, tipo_imovel_id,
        cidade_id, bairro, endereco_completo, exibir_endereco_completo,
        area_total, area_util, quartos, banheiros, vagas_garagem, cozinhas, lavanderias,
        fotos_json, video_youtube_id, tour_360_url,
        postar_na_rede, vendido_removido, slug,
        criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      dados.corretor_id,
      dados.titulo,
      dados.descricao || null,
      dados.preco_venda || null,
      dados.preco_aluguel || null,
      dados.tipo_negocio_id,
      dados.categoria_imovel_id,
      dados.tipo_imovel_id,
      dados.cidade_id,
      dados.bairro || null,
      dados.endereco_completo || null,
      dados.exibir_endereco_completo ? 1 : 0,
      dados.area_total || null,
      dados.area_util || null,
      dados.quartos || null,
      dados.banheiros || null,
      dados.vagas_garagem || null,
      dados.cozinhas || null,
      dados.lavanderias || null,
      dados.fotos_json || null,
      dados.video_youtube_id || null,
      dados.tour_360_url || null,
      1, // postar_na_rede = true por padrão
      0, // vendido_removido = false por padrão
      dados.slug,
      agora,
      agora
    )
    .run();

  return resultado.meta.last_row_id as number;
}

// ========== READ ==========

// Busca anúncio por ID
export async function buscarAnuncioPorId(db: D1Database, id: number): Promise<Anuncio | null> {
  try {
    const resultado = await db
      .prepare("SELECT * FROM anuncios WHERE id = ? LIMIT 1")
      .bind(id)
      .first();

    return resultado || null;
  } catch (erro) {
    console.error("Erro ao buscar anúncio:", erro);
    return null;
  }
}

// Lista anúncios do corretor logado com paginação
export async function listarAnunciosDoCorretor(
  db: D1Database,
  corretor_id: number,
  pagina: number = 1,
  limite: number = 10
): Promise<{ anuncios: Anuncio[]; total: number }> {
  try {
    const offset = (pagina - 1) * limite;

    // Conta total — exclui vendido/removido (mesmo critério de
    // contarAnunciosAtivosDoCorretor), senão um anúncio "deletado" pelo
    // painel (soft delete, ver marcarVendidoRemovido) continua aparecendo
    // na lista "Meus Anúncios" do corretor indefinidamente
    const contagem = await db
      .prepare("SELECT COUNT(*) as total FROM anuncios WHERE corretor_id = ? AND vendido_removido = 0")
      .bind(corretor_id)
      .first() as { total: number };

    // Lista com paginação
    const resultado = await db
      .prepare("SELECT * FROM anuncios WHERE corretor_id = ? AND vendido_removido = 0 ORDER BY criado_em DESC LIMIT ? OFFSET ?")
      .bind(corretor_id, limite, offset)
      .all();

    const anuncios = (resultado.results || []) as Anuncio[];

    return {
      anuncios,
      total: contagem.total || 0,
    };
  } catch (erro) {
    console.error("Erro ao listar anúncios:", erro);
    return { anuncios: [], total: 0 };
  }
}

// Conta anúncios ativos do corretor (para validar limite do Plano)
export async function contarAnunciosAtivosDoCorretor(db: D1Database, corretor_id: number): Promise<number> {
  try {
    const resultado = await db
      .prepare("SELECT COUNT(*) as total FROM anuncios WHERE corretor_id = ? AND vendido_removido = 0")
      .bind(corretor_id)
      .first() as { total: number };

    return resultado.total || 0;
  } catch (erro) {
    console.error("Erro ao contar anúncios:", erro);
    return 0;
  }
}

// ========== UPDATE ==========

// Atualiza campos editáveis do anúncio
export async function atualizarAnuncio(
  db: D1Database,
  id: number,
  dados: Partial<Anuncio>
): Promise<boolean> {
  try {
    const agora = new Date().toISOString();
    const campos: string[] = [];
    const valores: any[] = [];

    // Mapeia apenas campos que foram passados
    // "slug" fica na whitelist pra permitir a correção pós-criação (troca
    // do slug provisório "-0" pelo definitivo "-{id}", ver
    // routes/api-anuncios-crud.ts::handleCriarAnuncio) — handleEditarAnuncio
    // nunca repassa `dados.slug` do corpo da requisição do cliente, então
    // isso não abre edição de slug via PUT direto do corretor.
    const campos_editaveis = [
      "titulo",
      "descricao",
      "preco_venda",
      "preco_aluguel",
      "bairro",
      "endereco_completo",
      "exibir_endereco_completo",
      "area_total",
      "area_util",
      "quartos",
      "banheiros",
      "vagas_garagem",
      "cozinhas",
      "lavanderias",
      "fotos_json",
      "video_youtube_id",
      "tour_360_url",
      "postar_na_rede",
      "vendido_removido",
      "slug",
    ];

    for (const campo of campos_editaveis) {
      if (campo in dados) {
        campos.push(`${campo} = ?`);
        const valor = (dados as any)[campo];
        // Converte booleanos para 0/1 para o banco
        valores.push(typeof valor === "boolean" ? (valor ? 1 : 0) : valor);
      }
    }

    if (campos.length === 0) {
      return true; // Nada para atualizar
    }

    campos.push("atualizado_em = ?");
    valores.push(agora);
    valores.push(id);

    const sql = `UPDATE anuncios SET ${campos.join(", ")} WHERE id = ?`;

    await db.prepare(sql).bind(...valores).run();
    return true;
  } catch (erro) {
    console.error("Erro ao atualizar anúncio:", erro);
    return false;
  }
}

// Toggle "postar na rede" (acionado quando muda este campo — requer revalidação cruzada via Queue)
export async function togglePostarNaRede(db: D1Database, id: number, ativo: boolean): Promise<boolean> {
  try {
    const agora = new Date().toISOString();

    await db
      .prepare("UPDATE anuncios SET postar_na_rede = ?, atualizado_em = ? WHERE id = ?")
      .bind(ativo ? 1 : 0, agora, id)
      .run();

    return true;
  } catch (erro) {
    console.error("Erro ao fazer toggle de postar na rede:", erro);
    return false;
  }
}

// Mark anúncio como vendido/removido (status HTTP 410, conforme seção 4.17)
export async function marcarVendidoRemovido(db: D1Database, id: number): Promise<boolean> {
  try {
    const agora = new Date().toISOString();

    await db
      .prepare("UPDATE anuncios SET vendido_removido = 1, atualizado_em = ? WHERE id = ?")
      .bind(agora, id)
      .run();

    return true;
  } catch (erro) {
    console.error("Erro ao marcar anúncio como vendido/removido:", erro);
    return false;
  }
}

// ========== Restauração de Backup (Lote 17, seção 4.20) ==========

// Recria um anúncio a partir do JSON de backup, preservando o ID original
// (identificador imutável — seção 4.11). Só deve ser chamada para IDs que
// o chamador já confirmou não existirem (modo seguro, checagem por ID feita
// em routes/api-anuncios-backup.ts antes de gravar).
export async function restaurarAnuncioComId(db: D1Database, anuncio: Anuncio): Promise<void> {
  const agora = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO anuncios (
        id, corretor_id, titulo, descricao, preco_venda, preco_aluguel,
        tipo_negocio_id, categoria_imovel_id, tipo_imovel_id,
        cidade_id, bairro, endereco_completo, exibir_endereco_completo,
        area_total, area_util, quartos, banheiros, vagas_garagem, cozinhas, lavanderias,
        fotos_json, video_youtube_id, tour_360_url,
        postar_na_rede, vendido_removido, slug,
        criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      anuncio.id,
      anuncio.corretor_id,
      anuncio.titulo,
      anuncio.descricao || null,
      anuncio.preco_venda || null,
      anuncio.preco_aluguel || null,
      anuncio.tipo_negocio_id,
      anuncio.categoria_imovel_id,
      anuncio.tipo_imovel_id,
      anuncio.cidade_id,
      anuncio.bairro || null,
      anuncio.endereco_completo || null,
      anuncio.exibir_endereco_completo ? 1 : 0,
      anuncio.area_total || null,
      anuncio.area_util || null,
      anuncio.quartos || null,
      anuncio.banheiros || null,
      anuncio.vagas_garagem || null,
      anuncio.cozinhas || null,
      anuncio.lavanderias || null,
      anuncio.fotos_json || null,
      anuncio.video_youtube_id || null,
      anuncio.tour_360_url || null,
      anuncio.postar_na_rede ? 1 : 0,
      anuncio.vendido_removido ? 1 : 0,
      anuncio.slug,
      anuncio.criado_em || agora,
      agora
    )
    .run();
}

// ========== DELETE ==========

// Deleta anúncio (raro — normalmente usa vendido_removido)
export async function deletarAnuncio(db: D1Database, id: number): Promise<boolean> {
  try {
    await db.prepare("DELETE FROM anuncios WHERE id = ?").bind(id).run();
    return true;
  } catch (erro) {
    console.error("Erro ao deletar anúncio:", erro);
    return false;
  }
}
