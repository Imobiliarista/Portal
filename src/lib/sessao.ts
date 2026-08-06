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
      `SELECT corretor_id FROM sessoes
       WHERE session_id = ? AND expira_em > datetime('now')
       LIMIT 1`
    ).bind(sessionId).first() as { corretor_id: number } | null;

    if (!sessao) {
      return null;
    }

    return sessao.corretor_id;
  } catch (erro) {
    console.error("Erro ao validar sessão:", erro);
    return null;
  }
}
