// Queries para painel do Superadmin (Lote 9)
// Aprovação de pré-cadastros, gestão de cidades, módulos e visão geral da rede

import { PreCadastro, Cidade, ModuloAtivo } from "../types/modelos";
import { atribuirPlanoNaAprovacao } from "./queries-planos";

export interface PortalIndependente {
  id: number;
  nome: string;
  slug: string;
  formato: string;
  ativo: boolean;
  descricao?: string;
  criado_em: string;
  atualizado_em: string;
}

// ========== Pré-Cadastros ==========

// Lista pré-cadastros pendentes de aprovação
export async function listarPreCadastrosPendentes(db: D1Database, limite = 50, offset = 0): Promise<PreCadastro[]> {
  try {
    const resultados = await db
      .prepare(
        `SELECT * FROM pre_cadastros
         WHERE status = 'pendente'
         ORDER BY criado_em DESC
         LIMIT ? OFFSET ?`
      )
      .bind(limite, offset)
      .all();

    return (resultados.results || []) as PreCadastro[];
  } catch (erro) {
    console.error("Erro ao listar pré-cadastros pendentes:", erro);
    return [];
  }
}

// Busca detalhes de um pré-cadastro
export async function buscarPreCadastro(db: D1Database, id: number): Promise<PreCadastro | null> {
  try {
    const resultado = await db
      .prepare("SELECT * FROM pre_cadastros WHERE id = ? LIMIT 1")
      .bind(id)
      .first();

    return resultado as PreCadastro | null;
  } catch (erro) {
    console.error("Erro ao buscar pré-cadastro:", erro);
    return null;
  }
}

// Aprova um pré-cadastro (cria conta e minisite)
export async function aprovarPreCadastro(db: D1Database, precadastro_id: number, slug_minisite: string): Promise<boolean> {
  try {
    const precadastro = await buscarPreCadastro(db, precadastro_id);
    if (!precadastro) return false;

    const agora = new Date().toISOString();

    // Atualiza status do pré-cadastro
    await db
      .prepare("UPDATE pre_cadastros SET status = 'aprovado', atualizado_em = ? WHERE id = ?")
      .bind(agora, precadastro_id)
      .run();

    // Cria corretor (status = 'aprovado')
    const corretorInsert = await db
      .prepare(
        `INSERT INTO corretores (
          nome_completo, email, telefone, creci,
          senha_hash, senha_salt,
          status, papel, criado_em, atualizado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        precadastro.nome,
        precadastro.email.toLowerCase(),
        precadastro.telefone,
        precadastro.creci,
        "", // senha_hash vazio - será definido pelo pré-cadastro
        "", // salt vazio
        "aprovado",
        "corretor",
        agora,
        agora
      )
      .run();

    const corretor_id = corretorInsert.meta.last_row_id;

    // Cria minisite (inicialmente offline = false, já que foi aprovado)
    await db
      .prepare(
        `INSERT INTO minisites (corretor_id, slug, offline, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(corretor_id, slug_minisite, 0, agora, agora)
      .run();

    // Cria configuração de upload padrão
    await db
      .prepare(
        `INSERT INTO config_upload_corretor (
          corretor_id, max_resolucao_upload_bytes, criado_em, atualizado_em
        ) VALUES (?, ?, ?, ?)`
      )
      .bind(corretor_id, 5242880, agora, agora)
      .run();

    // Atribui o Plano (Promoção de Lançamento se houver vaga, senão o
    // plano padrão do sistema) — ver project.md, seções 6.3 e 6.5
    await atribuirPlanoNaAprovacao(db, corretor_id);

    return true;
  } catch (erro) {
    console.error("Erro ao aprovar pré-cadastro:", erro);
    return false;
  }
}

// Reprova um pré-cadastro
export async function reprovarPreCadastro(db: D1Database, precadastro_id: number, motivo?: string): Promise<boolean> {
  try {
    const agora = new Date().toISOString();

    await db
      .prepare(
        "UPDATE pre_cadastros SET status = 'reprovado', motivo_reprovacao = ?, atualizado_em = ? WHERE id = ?"
      )
      .bind(motivo || "", agora, precadastro_id)
      .run();

    return true;
  } catch (erro) {
    console.error("Erro ao reprovar pré-cadastro:", erro);
    return false;
  }
}

// ========== Cidades ==========

// Lista cidades
export async function listarCidades(db: D1Database, limite = 100, offset = 0): Promise<Cidade[]> {
  try {
    const resultados = await db
      .prepare(
        `SELECT * FROM cidades
         ORDER BY uf ASC, nome ASC
         LIMIT ? OFFSET ?`
      )
      .bind(limite, offset)
      .all();

    return (resultados.results || []) as Cidade[];
  } catch (erro) {
    console.error("Erro ao listar cidades:", erro);
    return [];
  }
}

// Busca uma cidade por ID
export async function buscarCidade(db: D1Database, id: number): Promise<Cidade | null> {
  try {
    const resultado = await db
      .prepare("SELECT * FROM cidades WHERE id = ? LIMIT 1")
      .bind(id)
      .first();

    return resultado as Cidade | null;
  } catch (erro) {
    console.error("Erro ao buscar cidade:", erro);
    return null;
  }
}

// Atualiza dados de uma cidade (manutenção excepcional)
export async function atualizarCidade(db: D1Database, id: number, dados: { nome?: string; ativo?: boolean }): Promise<boolean> {
  try {
    const agora = new Date().toISOString();
    const atualizacoes: string[] = ["atualizado_em = ?"];
    const valores: any[] = [agora];

    if (dados.nome !== undefined) {
      atualizacoes.push("nome = ?");
      valores.push(dados.nome);
    }
    if (dados.ativo !== undefined) {
      atualizacoes.push("ativo = ?");
      valores.push(dados.ativo ? 1 : 0);
    }

    valores.push(id);

    await db
      .prepare(`UPDATE cidades SET ${atualizacoes.join(", ")} WHERE id = ?`)
      .bind(...valores)
      .run();

    return true;
  } catch (erro) {
    console.error("Erro ao atualizar cidade:", erro);
    return false;
  }
}

// ========== Módulos ==========

// Lista módulos
export async function listarModulos(db: D1Database): Promise<ModuloAtivo[]> {
  try {
    const resultados = await db
      .prepare("SELECT * FROM modulos_ativos ORDER BY nome ASC")
      .all();

    return (resultados.results || []) as ModuloAtivo[];
  } catch (erro) {
    console.error("Erro ao listar módulos:", erro);
    return [];
  }
}

// Ativa/desativa um módulo
export async function alternarModulo(db: D1Database, modulo_id: number, ativo: boolean): Promise<boolean> {
  try {
    const agora = new Date().toISOString();

    await db
      .prepare("UPDATE modulos_ativos SET ativo = ?, atualizado_em = ? WHERE id = ?")
      .bind(ativo ? 1 : 0, agora, modulo_id)
      .run();

    return true;
  } catch (erro) {
    console.error("Erro ao alterar módulo:", erro);
    return false;
  }
}

// ========== Visão Geral da Rede ==========

export interface VisaoGeralRede {
  corretores_totais: number;
  corretores_aprovados: number;
  corretores_pendentes: number;
  corretores_reprovados: number;
  anuncios_totais: number;
  anuncios_na_rede: number;
  anuncios_privados: number;
}

// Retorna estatísticas da rede
export async function obterVisaoGeralRede(db: D1Database): Promise<VisaoGeralRede | null> {
  try {
    const corretoresTotais = await db
      .prepare("SELECT COUNT(*) as total FROM corretores")
      .first() as { total: number };

    const corretoresAprovados = await db
      .prepare("SELECT COUNT(*) as total FROM corretores WHERE status = 'aprovado'")
      .first() as { total: number };

    const corretoresPendentes = await db
      .prepare("SELECT COUNT(*) as total FROM corretores WHERE status = 'pre-cadastro'")
      .first() as { total: number };

    const corretoresReprovados = await db
      .prepare("SELECT COUNT(*) as total FROM corretores WHERE status = 'reprovado'")
      .first() as { total: number };

    const anunciosTotais = await db
      .prepare("SELECT COUNT(*) as total FROM anuncios")
      .first() as { total: number };

    const anunciosNaRede = await db
      .prepare("SELECT COUNT(*) as total FROM anuncios WHERE postar_na_rede = 1 AND vendido_removido = 0")
      .first() as { total: number };

    const anunciosPrivados = await db
      .prepare("SELECT COUNT(*) as total FROM anuncios WHERE postar_na_rede = 0 AND vendido_removido = 0")
      .first() as { total: number };

    return {
      corretores_totais: corretoresTotais.total,
      corretores_aprovados: corretoresAprovados.total,
      corretores_pendentes: corretoresPendentes.total,
      corretores_reprovados: corretoresReprovados.total,
      anuncios_totais: anunciosTotais.total,
      anuncios_na_rede: anunciosNaRede.total,
      anuncios_privados: anunciosPrivados.total,
    };
  } catch (erro) {
    console.error("Erro ao obter visão geral da rede:", erro);
    return null;
  }
}

// ========== Portais Independentes (Lote 12.2) ==========

// Lista portais independentes
export async function listarPortaisIndependentes(db: D1Database): Promise<PortalIndependente[]> {
  try {
    const resultados = await db
      .prepare("SELECT * FROM portais_independentes ORDER BY nome ASC")
      .all();

    return (resultados.results || []) as PortalIndependente[];
  } catch (erro) {
    console.error("Erro ao listar portais independentes:", erro);
    return [];
  }
}

// Busca um portal independente
export async function buscarPortalIndependente(db: D1Database, id: number): Promise<PortalIndependente | null> {
  try {
    const resultado = await db
      .prepare("SELECT * FROM portais_independentes WHERE id = ? LIMIT 1")
      .bind(id)
      .first();

    return resultado as PortalIndependente | null;
  } catch (erro) {
    console.error("Erro ao buscar portal independente:", erro);
    return null;
  }
}

// Ativa/desativa um portal independente
export async function alternarPortalIndependente(db: D1Database, portal_id: number, ativo: boolean): Promise<boolean> {
  try {
    const agora = new Date().toISOString();

    await db
      .prepare("UPDATE portais_independentes SET ativo = ?, atualizado_em = ? WHERE id = ?")
      .bind(ativo ? 1 : 0, agora, portal_id)
      .run();

    return true;
  } catch (erro) {
    console.error("Erro ao ativar/desativar portal independente:", erro);
    return false;
  }
}

// Cria um novo portal independente
export async function criarPortalIndependente(
  db: D1Database,
  dados: {
    nome: string;
    slug: string;
    formato: string;
    descricao?: string;
  }
): Promise<boolean> {
  try {
    const agora = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO portais_independentes (nome, slug, formato, descricao, ativo, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(dados.nome, dados.slug, dados.formato, dados.descricao || "", 0, agora, agora)
      .run();

    return true;
  } catch (erro) {
    console.error("Erro ao criar portal independente:", erro);
    return false;
  }
}

// Atualiza dados de um portal independente
export async function atualizarPortalIndependente(
  db: D1Database,
  id: number,
  dados: {
    nome?: string;
    slug?: string;
    formato?: string;
    descricao?: string;
    ativo?: boolean;
  }
): Promise<boolean> {
  try {
    const agora = new Date().toISOString();
    const atualizacoes: string[] = ["atualizado_em = ?"];
    const valores: any[] = [agora];

    if (dados.nome !== undefined) {
      atualizacoes.push("nome = ?");
      valores.push(dados.nome);
    }
    if (dados.slug !== undefined) {
      atualizacoes.push("slug = ?");
      valores.push(dados.slug);
    }
    if (dados.formato !== undefined) {
      atualizacoes.push("formato = ?");
      valores.push(dados.formato);
    }
    if (dados.descricao !== undefined) {
      atualizacoes.push("descricao = ?");
      valores.push(dados.descricao);
    }
    if (dados.ativo !== undefined) {
      atualizacoes.push("ativo = ?");
      valores.push(dados.ativo ? 1 : 0);
    }

    valores.push(id);

    await db
      .prepare(`UPDATE portais_independentes SET ${atualizacoes.join(", ")} WHERE id = ?`)
      .bind(...valores)
      .run();

    return true;
  } catch (erro) {
    console.error("Erro ao atualizar portal independente:", erro);
    return false;
  }
}
