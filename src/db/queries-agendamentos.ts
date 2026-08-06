// Queries para agendamento de visita a imóveis (Lote 12.7)
// Seção 2.1 e 5 do project.md — visitante solicita, corretor confirma/recusa

import { AgendamentoVisita, AgendamentoVisitaComAnuncio } from "../types/modelos";

export async function criarAgendamento(
  db: D1Database,
  anuncioId: number,
  corretorId: number,
  nomeVisitante: string,
  telefoneVisitante: string,
  emailVisitante: string,
  dataHorarioSugerido: string
): Promise<AgendamentoVisita | null> {
  try {
    const result = await db
      .prepare(
        `INSERT INTO agendamentos_visita
         (anuncio_id, corretor_id, nome_visitante, telefone_visitante, email_visitante, data_horario_sugerido, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pendente')
         RETURNING *`
      )
      .bind(
        anuncioId,
        corretorId,
        nomeVisitante,
        telefoneVisitante,
        emailVisitante,
        dataHorarioSugerido
      )
      .first<AgendamentoVisita>();

    return result || null;
  } catch (erro) {
    console.error("Erro ao criar agendamento:", erro);
    return null;
  }
}

export async function obterAgendamentosPorCorretor(
  db: D1Database,
  corretorId: number,
  status?: string
): Promise<AgendamentoVisitaComAnuncio[]> {
  try {
    let query = `
      SELECT
        av.*,
        a.titulo as titulo_anuncio,
        ti.nome as tipo_imovel,
        a.endereco_completo as endereco_anuncio
      FROM agendamentos_visita av
      JOIN anuncios a ON av.anuncio_id = a.id
      JOIN tipos_imovel ti ON a.tipo_imovel_id = ti.id
      WHERE av.corretor_id = ?
    `;

    const params: any[] = [corretorId];

    if (status) {
      query += ` AND av.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY av.criado_em DESC`;

    const result = await db.prepare(query).bind(...params).all<AgendamentoVisitaComAnuncio>();

    return result.results || [];
  } catch (erro) {
    console.error("Erro ao obter agendamentos do corretor:", erro);
    return [];
  }
}

export async function obterAgendamentoPorId(
  db: D1Database,
  agendamentoId: number
): Promise<AgendamentoVisita | null> {
  try {
    const result = await db
      .prepare(`SELECT * FROM agendamentos_visita WHERE id = ? LIMIT 1`)
      .bind(agendamentoId)
      .first<AgendamentoVisita>();

    return result || null;
  } catch (erro) {
    console.error("Erro ao obter agendamento:", erro);
    return null;
  }
}

export async function confirmarAgendamento(
  db: D1Database,
  agendamentoId: number
): Promise<AgendamentoVisita | null> {
  try {
    const result = await db
      .prepare(
        `UPDATE agendamentos_visita
         SET status = 'confirmado', respondido_em = CURRENT_TIMESTAMP
         WHERE id = ?
         RETURNING *`
      )
      .bind(agendamentoId)
      .first<AgendamentoVisita>();

    return result || null;
  } catch (erro) {
    console.error("Erro ao confirmar agendamento:", erro);
    return null;
  }
}

export async function recusarAgendamento(
  db: D1Database,
  agendamentoId: number,
  motivoRecusa?: string
): Promise<AgendamentoVisita | null> {
  try {
    const result = await db
      .prepare(
        `UPDATE agendamentos_visita
         SET status = 'recusado', motivo_recusa = ?, respondido_em = CURRENT_TIMESTAMP
         WHERE id = ?
         RETURNING *`
      )
      .bind(motivoRecusa || null, agendamentoId)
      .first<AgendamentoVisita>();

    return result || null;
  } catch (erro) {
    console.error("Erro ao recusar agendamento:", erro);
    return null;
  }
}

export async function cancelarAgendamento(
  db: D1Database,
  agendamentoId: number
): Promise<boolean> {
  try {
    await db
      .prepare(`UPDATE agendamentos_visita SET status = 'cancelado' WHERE id = ?`)
      .bind(agendamentoId)
      .run();

    return true;
  } catch (erro) {
    console.error("Erro ao cancelar agendamento:", erro);
    return false;
  }
}

export async function obterAgendamentosPorAnuncio(
  db: D1Database,
  anuncioId: number
): Promise<AgendamentoVisita[]> {
  try {
    const result = await db
      .prepare(
        `SELECT * FROM agendamentos_visita
         WHERE anuncio_id = ?
         ORDER BY criado_em DESC`
      )
      .bind(anuncioId)
      .all<AgendamentoVisita>();

    return result.results || [];
  } catch (erro) {
    console.error("Erro ao obter agendamentos do anúncio:", erro);
    return [];
  }
}
