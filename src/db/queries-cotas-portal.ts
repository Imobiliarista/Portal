// Queries para gerenciar cotas de portais externos (ZAP/OLX, ImóvelWeb, etc.)
// Conforme seção 4.11 do project.md

import { CotaPortal } from "../types/modelos";

// Lista todas as cotas do corretor
export async function listarCotasPortalDoCorretor(
  db: D1Database,
  corretor_id: number
): Promise<CotaPortal[]> {
  try {
    const resultado = await db
      .prepare("SELECT * FROM cotas_portal WHERE corretor_id = ? ORDER BY portal_nome ASC")
      .bind(corretor_id)
      .all<CotaPortal>();

    return resultado.results || [];
  } catch (erro) {
    console.error("Erro ao listar cotas de portal:", erro);
    return [];
  }
}

// Busca uma cota específica
export async function buscarCotaPortal(
  db: D1Database,
  corretor_id: number,
  portal_nome: string
): Promise<CotaPortal | null> {
  try {
    const resultado = await db
      .prepare("SELECT * FROM cotas_portal WHERE corretor_id = ? AND portal_nome = ? LIMIT 1")
      .bind(corretor_id, portal_nome)
      .first<CotaPortal>();

    return resultado || null;
  } catch (erro) {
    console.error("Erro ao buscar cota de portal:", erro);
    return null;
  }
}

// Cria ou atualiza uma cota de portal
export async function atualizarCotaPortal(
  db: D1Database,
  corretor_id: number,
  portal_nome: string,
  dados: {
    quantidade_contratada?: number | null; // null = ilimitado
    ativo: boolean;
  }
): Promise<void> {
  try {
    const agora = new Date().toISOString();

    // Verifica se já existe
    const existe = await buscarCotaPortal(db, corretor_id, portal_nome);

    if (existe) {
      // Atualiza
      await db
        .prepare(
          "UPDATE cotas_portal SET quantidade_contratada = ?, ativo = ?, atualizado_em = ? WHERE corretor_id = ? AND portal_nome = ?"
        )
        .bind(dados.quantidade_contratada, dados.ativo ? 1 : 0, agora, corretor_id, portal_nome)
        .run();
    } else {
      // Cria nova
      await db
        .prepare(
          `INSERT INTO cotas_portal (corretor_id, portal_nome, quantidade_contratada, ativo, criado_em, atualizado_em)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(corretor_id, portal_nome, dados.quantidade_contratada, dados.ativo ? 1 : 0, agora, agora)
        .run();
    }
  } catch (erro) {
    console.error("Erro ao atualizar cota de portal:", erro);
    throw erro;
  }
}

// Conta anúncios do corretor elegíveis para um portal (postar_na_rede = true)
export async function contarAnunciosElegiveisParaPortal(
  db: D1Database,
  corretor_id: number
): Promise<number> {
  try {
    const resultado = await db
      .prepare("SELECT COUNT(*) as total FROM anuncios WHERE corretor_id = ? AND postar_na_rede = 1 AND vendido_removido = 0")
      .bind(corretor_id)
      .first() as { total: number };

    return resultado.total || 0;
  } catch (erro) {
    console.error("Erro ao contar anúncios elegíveis:", erro);
    return 0;
  }
}
