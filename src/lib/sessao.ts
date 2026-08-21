// Utilitários compartilhados de autenticação e sessão
// Reutilizável por diferentes rotas autenticadas (api-anuncios, painel-corretor, etc.)

import { Env } from "../index";

// Extrai session_id do cookie e valida se o corretor está autenticado
export async function obterCorretorAutenticado(request: Request, env: Env): Promise<number | null> {
  try {
    const cookies = request.headers.get("cookie") || "";
    const sessionIdMatch = cookies.match(/session_id=([^;]*)/);

    if (!sessionIdMatch || !sessionIdMatch[1]) {
      return null;
    }

    const sessionId = sessionIdMatch[1];

    // Valida sessionId contra tabela de sessões em D1
    // Conforme seção 6.2 do project.md: sessão via cookie HttpOnly/Secure/SameSite
    const sessao = await env.DB.prepare(
      `SELECT corretor_id, expira_em FROM sessoes
       WHERE session_id = ?
       LIMIT 1`
    ).bind(sessionId).first() as { corretor_id: number; expira_em: string } | null;

    // Expiração comparada como Date (epoch ms via valueOf), nunca como
    // string: `expira_em` é gravado em ISO 8601 (`new Date().toISOString()`,
    // api-auth-login.ts) — comparar isso como texto contra `datetime('now')`
    // do SQLite (formato sem "T") dava até ~24h de graça além do TTL sempre
    // que a data batia, já que "T" > " " decidia a comparação antes mesmo
    // de olhar o horário. Ver Histórico de Decisões em project.md.
    if (!sessao || new Date(sessao.expira_em) <= new Date()) {
      return null;
    }

    return sessao.corretor_id;
  } catch (erro) {
    console.error("Erro ao validar sessão:", erro);
    return null;
  }
}
