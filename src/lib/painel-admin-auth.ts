// Auxiliares compartilhados entre as rotas do painel do Superadmin
// Conforme project.md, seção 6 e Lote 9

import { Env } from "../index";

// Extrai ID do Superadmin da sessão (cookie)
export async function obterSuperadminIdDaSessao(request: Request, env: Env): Promise<number | null> {
  const cookie = request.headers.get("cookie") || "";
  const sessionIdMatch = cookie.match(/session_id=([^;]+)/);

  if (!sessionIdMatch) return null;

  const sessionId = sessionIdMatch[1];

  try {
    const sessao = await env.DB.prepare(
      "SELECT c.id, s.expira_em FROM sessoes s JOIN corretores c ON s.corretor_id = c.id WHERE s.session_id = ? AND c.papel = 'superadmin' LIMIT 1"
    ).bind(sessionId).first() as { id: number; expira_em: string } | null;

    // Comparação como Date (epoch ms), nunca como string — ver
    // src/lib/sessao.ts::obterCorretorAutenticado e o Histórico de Decisões
    // em project.md pro bug original (~24h de graça além do TTL).
    if (!sessao || new Date(sessao.expira_em) <= new Date()) {
      return null;
    }

    return sessao.id;
  } catch {
    return null;
  }
}

// Resposta de erro padrão
export function respostaErro(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ erro: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Resposta de sucesso
export function respostaSucesso(dados: any): Response {
  return new Response(JSON.stringify(dados), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
