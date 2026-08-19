// Queries para corretores — validação, busca e status
// Lote 4: roteamento de minisite; consultas são expandidas em lotes posteriores

import { Corretor, Minisite } from "../types/modelos";

// A query abaixo faz JOIN com `minisites` e seleciona só um subconjunto de
// colunas de `corretores` — nunca o registro completo (`papel`,
// `promocao_lancamento`, `isento`, `config_modulos` não entram na SELECT).
// Por isso o retorno usa este tipo mais estreito em vez de `Corretor`
// completo; os dois únicos chamadores (gerar-json-corretor.ts,
// feed-portais-independentes/gerador.ts) só leem `.corretor.id`.
type CorretorResumoParaMinisite = Pick<
  Corretor,
  | "id"
  | "nome_completo"
  | "cpf"
  | "creci"
  | "email"
  | "whatsapp"
  | "telefone"
  | "endereco_residencial"
  | "status"
  | "criado_em"
  | "atualizado_em"
  | "senha_hash"
>;

type LinhaCorretorMinisite = Omit<CorretorResumoParaMinisite, "senha_hash"> & {
  minisite_id: number;
  corretor_id: number;
  slug: string;
  offline: boolean;
};

export async function buscarCorrelorPorSlug(
  db: D1Database,
  slug: string
): Promise<{ corretor: CorretorResumoParaMinisite; minisite: Minisite } | null> {
  try {
    const resultado = await db
      .prepare(
        `
        SELECT
          c.id, c.nome_completo, c.cpf, c.creci, c.email, c.whatsapp,
          c.telefone, c.endereco_residencial, c.status,
          c.criado_em, c.atualizado_em,
          m.id as minisite_id, m.corretor_id, m.slug, m.offline
        FROM corretores c
        JOIN minisites m ON c.id = m.corretor_id
        WHERE m.slug = ?
        LIMIT 1
      `
      )
      .bind(slug)
      .first<LinhaCorretorMinisite>();

    if (!resultado) {
      return null;
    }

    const corretor: CorretorResumoParaMinisite = {
      id: resultado.id,
      nome_completo: resultado.nome_completo,
      cpf: resultado.cpf,
      creci: resultado.creci,
      email: resultado.email,
      whatsapp: resultado.whatsapp,
      telefone: resultado.telefone,
      endereco_residencial: resultado.endereco_residencial,
      status: resultado.status,
      criado_em: resultado.criado_em,
      atualizado_em: resultado.atualizado_em,
      senha_hash: "", // Nunca retornar hash
    };

    const minisite: Minisite = {
      id: resultado.minisite_id,
      corretor_id: resultado.corretor_id,
      slug: resultado.slug,
      offline: resultado.offline,
      criado_em: "", // Campos vazios, detalhes carregáveis se necessário
      atualizado_em: "",
    };

    return { corretor, minisite };
  } catch (erro) {
    console.error("Erro ao buscar corretor por slug:", erro);
    return null;
  }
}

export async function estaMinisiteLiberado(
  db: D1Database,
  slug: string
): Promise<boolean> {
  try {
    const resultado = await db
      .prepare(
        `
        SELECT m.offline
        FROM minisites m
        WHERE m.slug = ?
        LIMIT 1
      `
      )
      .bind(slug)
      .first<{ offline: boolean }>();

    if (!resultado) {
      return false; // Minisite não existe
    }

    // offline = true significa site está offline; offline = false significa site está liberado
    return !resultado.offline;
  } catch (erro) {
    console.error("Erro ao verificar status do minisite:", erro);
    return false;
  }
}
