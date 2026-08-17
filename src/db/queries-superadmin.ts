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

// Aprova um pré-cadastro — PROMOVE o corretor já criado no pré-cadastro
// (nunca cria uma conta nova: senha_hash/senha_salt/cpf/nome_usuario
// definidos pelo próprio corretor no formulário público precisam
// continuar valendo pro login dele depois de aprovado). O vínculo vem de
// `pre_cadastros.corretor_id` (migration 0014) — sem isso, não há como
// saber qual corretor promover.
export async function aprovarPreCadastro(db: D1Database, precadastro_id: number, slug_minisite?: string): Promise<{ sucesso: boolean; slug?: string }> {
  try {
    const precadastro = await buscarPreCadastro(db, precadastro_id);
    if (!precadastro || !precadastro.corretor_id) return { sucesso: false };

    const agora = new Date().toISOString();
    const corretor_id = precadastro.corretor_id;

    // Atualiza status do pré-cadastro
    await db
      .prepare("UPDATE pre_cadastros SET status = 'aprovado', atualizado_em = ? WHERE id = ?")
      .bind(agora, precadastro_id)
      .run();

    // Promove o corretor existente pra 'aprovado' — credenciais
    // (senha_hash/senha_salt/cpf/nome_usuario) permanecem intocadas.
    await db
      .prepare("UPDATE corretores SET status = 'aprovado', atualizado_em = ? WHERE id = ?")
      .bind(agora, corretor_id)
      .run();

    // Libera o minisite (já existe, criado offline no pré-cadastro) —
    // opcionalmente troca o slug se o Superadmin informou um novo.
    if (slug_minisite?.trim()) {
      await db
        .prepare("UPDATE minisites SET offline = 0, slug = ?, atualizado_em = ? WHERE corretor_id = ?")
        .bind(slug_minisite.trim(), agora, corretor_id)
        .run();
    } else {
      await db
        .prepare("UPDATE minisites SET offline = 0, atualizado_em = ? WHERE corretor_id = ?")
        .bind(agora, corretor_id)
        .run();
    }

    // Atribui o Plano (Promoção de Lançamento se houver vaga, senão o
    // plano padrão do sistema) — ver project.md, seções 6.3 e 6.5
    await atribuirPlanoNaAprovacao(db, corretor_id);

    const slugFinal = slug_minisite?.trim() ||
      ((await db.prepare("SELECT slug FROM minisites WHERE corretor_id = ? LIMIT 1").bind(corretor_id).first()) as { slug: string } | undefined)?.slug;

    return { sucesso: true, slug: slugFinal };
  } catch (erro) {
    console.error("Erro ao aprovar pré-cadastro:", erro);
    return { sucesso: false };
  }
}

// Reprova um pré-cadastro — reflete o mesmo status/motivo no corretor
// vinculado (seção 6.1, passo 8: "site permanece offline e anúncios não
// são liberados").
export async function reprovarPreCadastro(db: D1Database, precadastro_id: number, motivo?: string): Promise<boolean> {
  try {
    const agora = new Date().toISOString();
    const precadastro = await buscarPreCadastro(db, precadastro_id);

    await db
      .prepare(
        "UPDATE pre_cadastros SET status = 'reprovado', motivo_reprovacao = ?, atualizado_em = ? WHERE id = ?"
      )
      .bind(motivo || "", agora, precadastro_id)
      .run();

    if (precadastro?.corretor_id) {
      await db
        .prepare("UPDATE corretores SET status = 'reprovado', motivo_reprovacao = ?, atualizado_em = ? WHERE id = ?")
        .bind(motivo || "", agora, precadastro.corretor_id)
        .run();
    }

    return true;
  } catch (erro) {
    console.error("Erro ao reprovar pré-cadastro:", erro);
    return false;
  }
}

// ========== Minisites (gestão completa da rede) ==========

export interface MinisiteListagem {
  minisite_id: number;
  corretor_id: number;
  nome_completo: string;
  slug: string;
  offline: boolean;
  status_corretor: string; // 'pre-cadastro' | 'aprovado' | 'reprovado'
  plano_nome: string | null;
  criado_em: string;
  // Presente só quando status_corretor === 'pre-cadastro' — deixa o front
  // reaproveitar POST /pre-cadastro/:id/aprovar direto desta tela, sem
  // duplicar a lógica de aprovarPreCadastro().
  pre_cadastro_id: number | null;
}

// Lista todos os minisites da rede (join com corretores/planos/pré-cadastro),
// com busca por nome ou slug e paginação — visão completa que complementa a
// fila de "pré-cadastros pendentes" (listarPreCadastrosPendentes acima).
export async function listarMinisites(
  db: D1Database,
  opcoes: { busca?: string; limite?: number; offset?: number } = {}
): Promise<{ dados: MinisiteListagem[]; total: number }> {
  const limite = opcoes.limite ?? 50;
  const offset = opcoes.offset ?? 0;
  const busca = opcoes.busca?.trim();

  try {
    const filtro = busca ? "AND (c.nome_completo LIKE ? OR m.slug LIKE ?)" : "";
    const bindsFiltro = busca ? [`%${busca}%`, `%${busca}%`] : [];

    const totalRow = (await db
      .prepare(
        `SELECT COUNT(*) as total
         FROM minisites m
         JOIN corretores c ON c.id = m.corretor_id
         WHERE 1=1 ${filtro}`
      )
      .bind(...bindsFiltro)
      .first()) as { total: number };

    const resultados = await db
      .prepare(
        `SELECT
           m.id as minisite_id, m.corretor_id, m.slug, m.offline, m.criado_em,
           c.nome_completo, c.status as status_corretor,
           p.nome as plano_nome,
           pc.id as pre_cadastro_id
         FROM minisites m
         JOIN corretores c ON c.id = m.corretor_id
         LEFT JOIN planos p ON p.id = c.plano_id
         LEFT JOIN pre_cadastros pc ON pc.corretor_id = c.id AND pc.status = 'pendente'
         WHERE 1=1 ${filtro}
         ORDER BY m.criado_em DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...bindsFiltro, limite, offset)
      .all();

    const dados: MinisiteListagem[] = (resultados.results || []).map((r: any) => ({
      minisite_id: r.minisite_id,
      corretor_id: r.corretor_id,
      nome_completo: r.nome_completo,
      slug: r.slug,
      offline: !!r.offline,
      status_corretor: r.status_corretor,
      plano_nome: r.plano_nome ?? null,
      criado_em: r.criado_em,
      pre_cadastro_id: r.pre_cadastro_id ?? null,
    }));

    return { dados, total: totalRow?.total ?? 0 };
  } catch (erro) {
    console.error("Erro ao listar minisites:", erro);
    return { dados: [], total: 0 };
  }
}

// Suspende/reativa um minisite JÁ APROVADO — alterna minisites.offline a
// qualquer momento (não só na aprovação inicial, que é o único caminho
// que aprovarPreCadastro cobre). Só se aplica a corretores com
// status='aprovado': pré-cadastros continuam usando aprovarPreCadastro, e
// reprovados não têm site pra suspender/reativar.
export async function alternarOfflineMinisite(
  db: D1Database,
  corretor_id: number,
  offline: boolean
): Promise<{ sucesso: boolean; slug?: string }> {
  try {
    const corretor = (await db
      .prepare("SELECT status FROM corretores WHERE id = ? LIMIT 1")
      .bind(corretor_id)
      .first()) as { status: string } | null;

    if (!corretor || corretor.status !== "aprovado") {
      return { sucesso: false };
    }

    const agora = new Date().toISOString();

    await db
      .prepare("UPDATE minisites SET offline = ?, atualizado_em = ? WHERE corretor_id = ?")
      .bind(offline ? 1 : 0, agora, corretor_id)
      .run();

    const minisite = (await db
      .prepare("SELECT slug FROM minisites WHERE corretor_id = ? LIMIT 1")
      .bind(corretor_id)
      .first()) as { slug: string } | null;

    return { sucesso: true, slug: minisite?.slug };
  } catch (erro) {
    console.error("Erro ao alternar status do minisite:", erro);
    return { sucesso: false };
  }
}

// Edita nome do corretor e/ou slug do minisite (dados básicos) — usado
// pela tela de gestão pra correções pontuais, sem passar pelo fluxo de
// pré-cadastro/aprovação.
export async function atualizarDadosBasicosMinisite(
  db: D1Database,
  corretor_id: number,
  dados: { nome?: string; slug?: string }
): Promise<boolean> {
  try {
    const agora = new Date().toISOString();

    if (dados.nome?.trim()) {
      await db
        .prepare("UPDATE corretores SET nome_completo = ?, atualizado_em = ? WHERE id = ?")
        .bind(dados.nome.trim(), agora, corretor_id)
        .run();
    }

    if (dados.slug?.trim()) {
      await db
        .prepare("UPDATE minisites SET slug = ?, atualizado_em = ? WHERE corretor_id = ?")
        .bind(dados.slug.trim(), agora, corretor_id)
        .run();
    }

    return true;
  } catch (erro) {
    console.error("Erro ao atualizar dados básicos do minisite:", erro);
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
