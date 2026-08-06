// Queries para buscas salvas com alertas por e-mail (Lote 12.6)
// Seção 6 do project.md — LGPD: revogação de consentimento via token

export interface BuscaSalva {
  id: number;
  email: string;
  criterios: string; // JSON
  token_cancelamento: string;
  notificacoes_enviadas?: string; // JSON array
  criado_em: string;
  ultima_notificacao_em: string | null;
  ativo: boolean;
}

interface Criterios {
  cidade?: string;
  tipo_negocio?: string;
  categoria?: string;
  tipo_imovel?: string;
  preco_min?: number;
  preco_max?: number;
  quartos?: number;
  banheiros?: number;
  area_min?: number;
  area_max?: number;
  [key: string]: any;
}

export async function criarBuscaSalva(
  db: D1Database,
  email: string,
  criterios: Criterios,
  tokenCancelamento: string
): Promise<BuscaSalva | null> {
  try {
    const result = await db
      .prepare(
        `INSERT INTO buscas_salvas (email, criterios, token_cancelamento, notificacoes_enviadas)
         VALUES (?, ?, ?, ?)
         RETURNING *`
      )
      .bind(email, JSON.stringify(criterios), tokenCancelamento, JSON.stringify([]))
      .first<BuscaSalva>();

    return result || null;
  } catch (erro) {
    console.error("Erro ao criar busca salva:", erro);
    return null;
  }
}

export async function obterBuscasPorEmail(
  db: D1Database,
  email: string
): Promise<BuscaSalva[]> {
  try {
    const result = await db
      .prepare(`SELECT * FROM buscas_salvas WHERE email = ? AND ativo = 1`)
      .bind(email)
      .all<BuscaSalva>();

    return result.results || [];
  } catch (erro) {
    console.error("Erro ao obter buscas salvas:", erro);
    return [];
  }
}

export async function obterBuscaPorToken(
  db: D1Database,
  token: string
): Promise<BuscaSalva | null> {
  try {
    const result = await db
      .prepare(`SELECT * FROM buscas_salvas WHERE token_cancelamento = ? LIMIT 1`)
      .bind(token)
      .first<BuscaSalva>();

    return result || null;
  } catch (erro) {
    console.error("Erro ao obter busca por token:", erro);
    return null;
  }
}

export async function cancelarBuscaSalva(
  db: D1Database,
  token: string
): Promise<boolean> {
  try {
    await db
      .prepare(`UPDATE buscas_salvas SET ativo = 0 WHERE token_cancelamento = ?`)
      .bind(token)
      .run();

    return true;
  } catch (erro) {
    console.error("Erro ao cancelar busca salva:", erro);
    return false;
  }
}

export async function obterBuscasAtivas(db: D1Database): Promise<BuscaSalva[]> {
  try {
    const result = await db
      .prepare(`SELECT * FROM buscas_salvas WHERE ativo = 1`)
      .all<BuscaSalva>();

    return result.results || [];
  } catch (erro) {
    console.error("Erro ao obter buscas ativas:", erro);
    return [];
  }
}

export async function verificarJaNotificado(
  buscaSalva: BuscaSalva,
  anuncioId: number
): Promise<boolean> {
  try {
    if (!buscaSalva.notificacoes_enviadas) {
      return false;
    }

    const notificacoes = JSON.parse(buscaSalva.notificacoes_enviadas);
    return notificacoes.some((n: any) => n.anuncio_id === anuncioId);
  } catch {
    return false;
  }
}

export async function adicionarNotificacaoEnviada(
  db: D1Database,
  buscaSalvaId: number,
  anuncioId: number
): Promise<boolean> {
  try {
    const busca = await db
      .prepare(`SELECT notificacoes_enviadas FROM buscas_salvas WHERE id = ?`)
      .bind(buscaSalvaId)
      .first<{ notificacoes_enviadas: string }>();

    if (!busca) {
      return false;
    }

    const notificacoes = busca.notificacoes_enviadas
      ? JSON.parse(busca.notificacoes_enviadas)
      : [];

    notificacoes.push({
      anuncio_id: anuncioId,
      enviado_em: new Date().toISOString(),
    });

    await db
      .prepare(
        `UPDATE buscas_salvas SET notificacoes_enviadas = ?, ultima_notificacao_em = CURRENT_TIMESTAMP WHERE id = ?`
      )
      .bind(JSON.stringify(notificacoes), buscaSalvaId)
      .run();

    return true;
  } catch (erro) {
    console.error("Erro ao adicionar notificação:", erro);
    return false;
  }
}
