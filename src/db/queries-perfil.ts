// Queries para perfil do corretor e dados de plano
// Conforme seção 6.1 do project.md

import { Corretor, ConfigUploadCorretor, Plano } from "../types/modelos";

// Busca dados completos do corretor (sem hash de senha)
export async function buscarCorretorPorId(db: D1Database, id: number): Promise<Corretor | null> {
  try {
    const resultado = await db
      .prepare("SELECT * FROM corretores WHERE id = ? LIMIT 1")
      .bind(id)
      .first<Corretor>();

    if (!resultado) return null;

    // Nunca retornar hash de senha
    const corretor: Corretor = { ...resultado, senha_hash: "" };
    return corretor;
  } catch (erro) {
    console.error("Erro ao buscar corretor:", erro);
    return null;
  }
}

// Atualiza campos editáveis do corretor
export async function atualizarPerfilEditavelDoCorretor(
  db: D1Database,
  corretor_id: number,
  dados: {
    endereco_residencial?: string;
    telefone?: string;
    email?: string;
    whatsapp?: string;
  }
): Promise<void> {
  try {
    const agora = new Date().toISOString();

    const atualizacoes: string[] = [];
    const valores: any[] = [];

    if (dados.endereco_residencial !== undefined) {
      atualizacoes.push("endereco_residencial = ?");
      valores.push(dados.endereco_residencial);
    }
    if (dados.telefone !== undefined) {
      atualizacoes.push("telefone = ?");
      valores.push(dados.telefone);
    }
    if (dados.email !== undefined) {
      atualizacoes.push("email = ?");
      valores.push(dados.email);
    }
    if (dados.whatsapp !== undefined) {
      atualizacoes.push("whatsapp = ?");
      valores.push(dados.whatsapp);
    }

    if (atualizacoes.length === 0) return;

    atualizacoes.push("atualizado_em = ?");
    valores.push(agora);
    valores.push(corretor_id);

    const sql = `UPDATE corretores SET ${atualizacoes.join(", ")} WHERE id = ?`;
    await db.prepare(sql).bind(...valores).run();
  } catch (erro) {
    console.error("Erro ao atualizar perfil:", erro);
    throw erro;
  }
}

// Busca o plano contratado (catálogo) do corretor, via corretores.plano_id
export async function buscarPlanoDoCorretor(db: D1Database, corretor_id: number): Promise<Plano | null> {
  try {
    const resultado = await db
      .prepare(
        `SELECT p.* FROM planos p
         JOIN corretores c ON c.plano_id = p.id
         WHERE c.id = ? LIMIT 1`
      )
      .bind(corretor_id)
      .first();

    return resultado as Plano | null;
  } catch (erro) {
    console.error("Erro ao buscar plano do corretor:", erro);
    return null;
  }
}

// Busca a configuração de upload do corretor (resolução máxima, chave própria do Google Maps)
export async function buscarConfigUploadDoCorretor(db: D1Database, corretor_id: number): Promise<ConfigUploadCorretor | null> {
  try {
    const resultado = await db
      .prepare("SELECT * FROM config_upload_corretor WHERE corretor_id = ? LIMIT 1")
      .bind(corretor_id)
      .first();

    return resultado as ConfigUploadCorretor | null;
  } catch (erro) {
    console.error("Erro ao buscar configuração de upload:", erro);
    return null;
  }
}

// Busca status do minisite (offline ou liberado)
export async function buscarMinisiteDoCorretor(db: D1Database, corretor_id: number): Promise<{ slug: string; offline: boolean } | null> {
  try {
    const resultado = await db
      .prepare("SELECT slug, offline FROM minisites WHERE corretor_id = ? LIMIT 1")
      .bind(corretor_id)
      .first<{ slug: string; offline: boolean }>();

    return resultado || null;
  } catch (erro) {
    console.error("Erro ao buscar minisite:", erro);
    return null;
  }
}
