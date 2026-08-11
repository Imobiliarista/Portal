// Queries para o catálogo de Planos (Lote 14)
// CRUD de planos, regras de troca de plano e contador da Promoção de Lançamento
// Conforme project.md, seções 5.1.3, 6.3, 6.4, 6.5

import { Plano } from "../types/modelos";

// ========== CRUD de Planos (6.3) ==========

// Lista planos (por padrão só os ativos; incluirInativos traz todos)
export async function listarPlanos(db: D1Database, incluirInativos = false): Promise<Plano[]> {
  try {
    const sql = incluirInativos
      ? "SELECT * FROM planos ORDER BY preco_mensalidade ASC"
      : "SELECT * FROM planos WHERE ativo = 1 ORDER BY preco_mensalidade ASC";

    const resultados = await db.prepare(sql).all();
    return (resultados.results || []) as Plano[];
  } catch (erro) {
    console.error("Erro ao listar planos:", erro);
    return [];
  }
}

// Busca um plano por ID
export async function buscarPlano(db: D1Database, id: number): Promise<Plano | null> {
  try {
    const resultado = await db
      .prepare("SELECT * FROM planos WHERE id = ? LIMIT 1")
      .bind(id)
      .first();

    return resultado as Plano | null;
  } catch (erro) {
    console.error("Erro ao buscar plano:", erro);
    return null;
  }
}

// Busca o plano padrão do sistema (usado quando o corretor ainda não tem
// um plano atribuído — ver 6.3). Convenção: "Plano 1", o mais barato ativo.
export async function buscarPlanoPadrao(db: D1Database): Promise<Plano | null> {
  try {
    const resultado = await db
      .prepare("SELECT * FROM planos WHERE ativo = 1 ORDER BY preco_mensalidade ASC LIMIT 1")
      .first();

    return resultado as Plano | null;
  } catch (erro) {
    console.error("Erro ao buscar plano padrão:", erro);
    return null;
  }
}

// Cria um novo plano
export async function criarPlano(
  db: D1Database,
  dados: {
    nome: string;
    max_anuncios: number;
    max_fotos_por_anuncio: number;
    taxa_adesao: number;
    preco_mensalidade: number;
    permite_pwa: boolean;
    permite_publicacoes: boolean;
    permite_api_google_maps: boolean;
  }
): Promise<number | null> {
  try {
    const agora = new Date().toISOString();

    const insercao = await db
      .prepare(
        `INSERT INTO planos (
          nome, max_anuncios, max_fotos_por_anuncio, taxa_adesao, preco_mensalidade,
          permite_pwa, permite_publicacoes, permite_api_google_maps, ativo,
          criado_em, atualizado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .bind(
        dados.nome,
        dados.max_anuncios,
        dados.max_fotos_por_anuncio,
        dados.taxa_adesao,
        dados.preco_mensalidade,
        dados.permite_pwa ? 1 : 0,
        dados.permite_publicacoes ? 1 : 0,
        dados.permite_api_google_maps ? 1 : 0,
        agora,
        agora
      )
      .run();

    return insercao.meta.last_row_id as number;
  } catch (erro) {
    console.error("Erro ao criar plano:", erro);
    return null;
  }
}

// Edita um plano existente
export async function atualizarPlano(
  db: D1Database,
  id: number,
  dados: {
    nome?: string;
    max_anuncios?: number;
    max_fotos_por_anuncio?: number;
    taxa_adesao?: number;
    preco_mensalidade?: number;
    permite_pwa?: boolean;
    permite_publicacoes?: boolean;
    permite_api_google_maps?: boolean;
  }
): Promise<boolean> {
  try {
    const agora = new Date().toISOString();
    const atualizacoes: string[] = ["atualizado_em = ?"];
    const valores: any[] = [agora];

    const camposDiretos: (keyof typeof dados)[] = ["nome", "max_anuncios", "max_fotos_por_anuncio", "taxa_adesao", "preco_mensalidade"];
    for (const campo of camposDiretos) {
      if (dados[campo] !== undefined) {
        atualizacoes.push(`${campo} = ?`);
        valores.push(dados[campo]);
      }
    }

    const camposBooleanos: (keyof typeof dados)[] = ["permite_pwa", "permite_publicacoes", "permite_api_google_maps"];
    for (const campo of camposBooleanos) {
      if (dados[campo] !== undefined) {
        atualizacoes.push(`${campo} = ?`);
        valores.push(dados[campo] ? 1 : 0);
      }
    }

    valores.push(id);

    await db
      .prepare(`UPDATE planos SET ${atualizacoes.join(", ")} WHERE id = ?`)
      .bind(...valores)
      .run();

    return true;
  } catch (erro) {
    console.error("Erro ao atualizar plano:", erro);
    return false;
  }
}

// Desativa um plano — não afeta corretores já nele, só impede novas atribuições
export async function desativarPlano(db: D1Database, id: number): Promise<boolean> {
  try {
    const agora = new Date().toISOString();

    await db
      .prepare("UPDATE planos SET ativo = 0, atualizado_em = ? WHERE id = ?")
      .bind(agora, id)
      .run();

    return true;
  } catch (erro) {
    console.error("Erro ao desativar plano:", erro);
    return false;
  }
}

// ========== Troca de Plano (6.4) ==========

export interface ResultadoTrocaPlano {
  permitido: boolean;
  mensagem?: string;
}

// Verifica se o corretor cabe nos limites do plano novo (uso em downgrade)
export async function verificarLimitesParaTrocaPlano(
  db: D1Database,
  corretor_id: number,
  plano_novo: Plano
): Promise<ResultadoTrocaPlano> {
  try {
    const anuncios = await db
      .prepare("SELECT COUNT(*) as total FROM anuncios WHERE corretor_id = ? AND vendido_removido = 0")
      .bind(corretor_id)
      .first() as { total: number };

    if (anuncios.total > plano_novo.max_anuncios) {
      return {
        permitido: false,
        mensagem: `Você tem ${anuncios.total} anúncios ativos; o ${plano_novo.nome} permite até ${plano_novo.max_anuncios} — reduza antes de trocar.`,
      };
    }

    const anuncioComMaisFotos = await db
      .prepare(
        `SELECT MAX(json_array_length(fotos_json)) as max_fotos
         FROM anuncios WHERE corretor_id = ? AND vendido_removido = 0 AND fotos_json IS NOT NULL`
      )
      .bind(corretor_id)
      .first() as { max_fotos: number | null };

    const maxFotosAtual = anuncioComMaisFotos?.max_fotos || 0;
    if (maxFotosAtual > plano_novo.max_fotos_por_anuncio) {
      return {
        permitido: false,
        mensagem: `Você tem um anúncio com ${maxFotosAtual} fotos; o ${plano_novo.nome} permite até ${plano_novo.max_fotos_por_anuncio} fotos por anúncio — reduza antes de trocar.`,
      };
    }

    return { permitido: true };
  } catch (erro) {
    console.error("Erro ao verificar limites para troca de plano:", erro);
    return { permitido: false, mensagem: "Erro ao verificar limites do plano" };
  }
}

// Troca o plano do corretor — bloqueia downgrade que excede limites,
// upgrade é sempre permitido e tem efeito imediato
export async function trocarPlanoDoCorretor(
  db: D1Database,
  corretor_id: number,
  plano_id_novo: number
): Promise<ResultadoTrocaPlano> {
  try {
    const corretor = await db
      .prepare("SELECT plano_id FROM corretores WHERE id = ? LIMIT 1")
      .bind(corretor_id)
      .first() as { plano_id: number | null } | null;

    if (!corretor) return { permitido: false, mensagem: "Corretor não encontrado" };

    const planoNovo = await buscarPlano(db, plano_id_novo);
    if (!planoNovo || !planoNovo.ativo) {
      return { permitido: false, mensagem: "Plano inválido ou inativo" };
    }

    // Upgrade (ou primeira atribuição de plano) é sempre permitido
    const planoAtual = corretor.plano_id ? await buscarPlano(db, corretor.plano_id) : null;
    const ehDowngrade = planoAtual ? planoNovo.preco_mensalidade < planoAtual.preco_mensalidade : false;

    if (ehDowngrade) {
      const verificacao = await verificarLimitesParaTrocaPlano(db, corretor_id, planoNovo);
      if (!verificacao.permitido) return verificacao;
    }

    const agora = new Date().toISOString();
    await db
      .prepare("UPDATE corretores SET plano_id = ?, atualizado_em = ? WHERE id = ?")
      .bind(plano_id_novo, agora, corretor_id)
      .run();

    return { permitido: true };
  } catch (erro) {
    console.error("Erro ao trocar plano do corretor:", erro);
    return { permitido: false, mensagem: "Erro ao processar troca de plano" };
  }
}

// ========== Promoção de Lançamento (6.5) ==========

const LIMITE_PROMOCAO_LANCAMENTO = 1000;
const DATA_CORTE_PROMOCAO_LANCAMENTO = "2027-01-01";
const MOTIVO_PROMOCAO_LANCAMENTO = "Promoção de Lançamento";

export interface ContadorPromocaoLancamento {
  usadas: number;
  limite: number;
}

// Conta quantos corretores já usaram a Promoção de Lançamento
export async function contarVagasPromocaoLancamento(db: D1Database): Promise<ContadorPromocaoLancamento> {
  try {
    const resultado = await db
      .prepare("SELECT COUNT(*) as total FROM corretores WHERE promocao_lancamento = 1")
      .first() as { total: number };

    return { usadas: resultado.total, limite: LIMITE_PROMOCAO_LANCAMENTO };
  } catch (erro) {
    console.error("Erro ao contar vagas da promoção de lançamento:", erro);
    return { usadas: 0, limite: LIMITE_PROMOCAO_LANCAMENTO };
  }
}

// Define o plano/isenção de um corretor recém-aprovado — chamado do fluxo
// de aprovação (queries-superadmin.ts). Se ainda houver vagas na promoção,
// atribui o Plano 1 com isenção até a data de corte; senão, cai no plano
// padrão do sistema, sem isenção.
export async function atribuirPlanoNaAprovacao(db: D1Database, corretor_id: number): Promise<void> {
  const planoPadrao = await buscarPlanoPadrao(db);
  if (!planoPadrao) {
    console.error("Nenhum plano ativo encontrado para atribuir na aprovação");
    return;
  }

  const agora = new Date().toISOString();
  const contador = await contarVagasPromocaoLancamento(db);

  if (contador.usadas < LIMITE_PROMOCAO_LANCAMENTO) {
    await db
      .prepare(
        `UPDATE corretores SET
          plano_id = ?, promocao_lancamento = 1, isento = 1,
          isento_ate = ?, motivo_isencao = ?, atualizado_em = ?
         WHERE id = ?`
      )
      .bind(planoPadrao.id, DATA_CORTE_PROMOCAO_LANCAMENTO, MOTIVO_PROMOCAO_LANCAMENTO, agora, corretor_id)
      .run();
  } else {
    await db
      .prepare("UPDATE corretores SET plano_id = ?, atualizado_em = ? WHERE id = ?")
      .bind(planoPadrao.id, agora, corretor_id)
      .run();
  }
}
