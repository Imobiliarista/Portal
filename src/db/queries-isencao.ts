// Queries para o Controle de Isenção de Cobrança genérico (Lote 14)
// Conceder/editar/revogar isenção de qualquer corretor, com log de auditoria
// Conforme project.md, seção 6.6

import { LogIsencao } from "../types/modelos";

export interface CorretorIsencao {
  id: number;
  nome_completo: string;
  email: string;
  plano_id: number | null;
  isento: boolean;
  isento_ate: string | null;
  motivo_isencao: string | null;
}

// Lista corretores com seus dados de isenção (painel do Superadmin)
export async function listarCorretoresParaIsencao(db: D1Database, limite = 50, offset = 0): Promise<CorretorIsencao[]> {
  try {
    const resultados = await db
      .prepare(
        `SELECT id, nome_completo, email, plano_id, isento, isento_ate, motivo_isencao
         FROM corretores
         ORDER BY nome_completo ASC
         LIMIT ? OFFSET ?`
      )
      .bind(limite, offset)
      .all();

    return (resultados.results || []) as CorretorIsencao[];
  } catch (erro) {
    console.error("Erro ao listar corretores para isenção:", erro);
    return [];
  }
}

// Registra uma entrada no log de auditoria de isenção
async function registrarLogIsencao(
  db: D1Database,
  corretor_id: number,
  alterado_por: number,
  campo: string,
  valor_anterior: string | null,
  valor_novo: string | null,
  motivo?: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO log_isencao (corretor_id, alterado_por, campo, valor_anterior, valor_novo, motivo, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(corretor_id, alterado_por, campo, valor_anterior, valor_novo, motivo || null, new Date().toISOString())
    .run();
}

// Concede ou edita a isenção de um corretor — motivo é obrigatório ao conceder
export async function concederOuEditarIsencao(
  db: D1Database,
  corretor_id: number,
  alterado_por: number,
  dados: { isento: boolean; isento_ate?: string | null; motivo: string }
): Promise<boolean> {
  try {
    const anterior = await db
      .prepare("SELECT isento, isento_ate, motivo_isencao FROM corretores WHERE id = ? LIMIT 1")
      .bind(corretor_id)
      .first() as { isento: number; isento_ate: string | null; motivo_isencao: string | null } | null;

    if (!anterior) return false;

    const agora = new Date().toISOString();
    await db
      .prepare(
        `UPDATE corretores SET isento = ?, isento_ate = ?, motivo_isencao = ?, atualizado_em = ? WHERE id = ?`
      )
      .bind(dados.isento ? 1 : 0, dados.isento_ate || null, dados.motivo, agora, corretor_id)
      .run();

    if (!!anterior.isento !== dados.isento) {
      await registrarLogIsencao(db, corretor_id, alterado_por, "isento", String(!!anterior.isento), String(dados.isento), dados.motivo);
    }
    if ((anterior.isento_ate || null) !== (dados.isento_ate || null)) {
      await registrarLogIsencao(db, corretor_id, alterado_por, "isento_ate", anterior.isento_ate, dados.isento_ate || null, dados.motivo);
    }
    if ((anterior.motivo_isencao || null) !== dados.motivo) {
      await registrarLogIsencao(db, corretor_id, alterado_por, "motivo_isencao", anterior.motivo_isencao, dados.motivo, dados.motivo);
    }

    return true;
  } catch (erro) {
    console.error("Erro ao conceder/editar isenção:", erro);
    return false;
  }
}

// Revoga a isenção de um corretor
export async function revogarIsencao(
  db: D1Database,
  corretor_id: number,
  alterado_por: number,
  motivo?: string
): Promise<boolean> {
  try {
    const anterior = await db
      .prepare("SELECT isento, isento_ate, motivo_isencao FROM corretores WHERE id = ? LIMIT 1")
      .bind(corretor_id)
      .first() as { isento: number; isento_ate: string | null; motivo_isencao: string | null } | null;

    if (!anterior) return false;
    if (!anterior.isento) return true; // já não está isento, nada a fazer

    const agora = new Date().toISOString();
    await db
      .prepare(
        `UPDATE corretores SET isento = 0, isento_ate = NULL, motivo_isencao = NULL, atualizado_em = ? WHERE id = ?`
      )
      .bind(agora, corretor_id)
      .run();

    await registrarLogIsencao(db, corretor_id, alterado_por, "isento", "true", "false", motivo || "Isenção revogada");

    return true;
  } catch (erro) {
    console.error("Erro ao revogar isenção:", erro);
    return false;
  }
}

// Histórico de auditoria de isenção de um corretor
export async function listarLogIsencaoDoCorretor(db: D1Database, corretor_id: number): Promise<LogIsencao[]> {
  try {
    const resultados = await db
      .prepare("SELECT * FROM log_isencao WHERE corretor_id = ? ORDER BY criado_em DESC")
      .bind(corretor_id)
      .all();

    return (resultados.results || []) as LogIsencao[];
  } catch (erro) {
    console.error("Erro ao listar log de isenção:", erro);
    return [];
  }
}
