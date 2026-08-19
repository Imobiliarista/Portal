// Queries para gerenciar módulos ativos/inativos
// Conforme seção 4.2.1 do project.md

import { ModuloAtivo } from "../types/modelos";

// Verifica se um módulo está ativo
export async function estaModuloAtivo(
  db: D1Database,
  slug: string
): Promise<boolean> {
  try {
    const resultado = await db
      .prepare("SELECT ativo FROM modulos_ativos WHERE slug = ? LIMIT 1")
      .bind(slug)
      .first() as { ativo: number } | undefined;

    if (!resultado) {
      console.warn(`Módulo "${slug}" não encontrado na tabela modulos_ativos`);
      return false;
    }

    return resultado.ativo === 1;
  } catch (erro) {
    console.error(`Erro ao verificar status do módulo "${slug}":`, erro);
    return false;
  }
}

// Lista todos os módulos e seus status
export async function listarModulos(db: D1Database): Promise<ModuloAtivo[]> {
  try {
    const resultado = await db
      .prepare("SELECT * FROM modulos_ativos ORDER BY nome ASC")
      .all<ModuloAtivo>();

    return resultado.results || [];
  } catch (erro) {
    console.error("Erro ao listar módulos:", erro);
    return [];
  }
}

// Atualiza o status de um módulo (ativado/desativado via painel Superadmin)
export async function atualizarStatusModulo(
  db: D1Database,
  slug: string,
  ativo: boolean
): Promise<boolean> {
  try {
    const agora = new Date().toISOString();
    const resultado = await db
      .prepare("UPDATE modulos_ativos SET ativo = ?, atualizado_em = ? WHERE slug = ?")
      .bind(ativo ? 1 : 0, agora, slug)
      .run();

    return (resultado.meta.changes || 0) > 0;
  } catch (erro) {
    console.error(`Erro ao atualizar status do módulo "${slug}":`, erro);
    return false;
  }
}
