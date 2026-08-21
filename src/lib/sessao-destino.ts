// Resolve, a partir da sessão (cookie), pra onde o corretor/superadmin deve
// ir depois de logar — usado pelo login (api-auth-login.ts) e pelos gates
// que protegem o HTML do painel (routes/painel-gate.ts, routes/minisite.ts).
// Fonte única de verdade: evita duas páginas de login (raiz e subdomínio)
// reimplementando a mesma decisão de destino de formas divergentes.
//
// Regra (comando "Login real + redirecionamento por sessão"):
//   - papel = 'superadmin'                        → /painel-admin/ (raiz)
//   - corretor com minisite liberado (offline=0)   → {slug}.imobiliarista.net/painel/
//   - corretor sem minisite liberado (pendente)    → /painel/ (raiz)
//
// Sempre URL absoluta: o login pode acontecer tanto na raiz quanto no
// subdomínio do próprio corretor, e o destino pode cruzar de host (raiz →
// subdomínio do corretor, ou vice-versa pro superadmin) — um caminho
// relativo resolveria contra o host errado nesses casos.

import { Env } from "../index";

const DOMINIO_RAIZ = "imobiliarista.net";

export interface SessaoCompleta {
  corretor_id: number;
  papel: "corretor" | "superadmin";
  minisite_slug: string | null;
  minisite_liberado: boolean;
}

// Extrai e valida a sessão (cookie session_id) contra D1, já trazendo papel
// e estado do minisite — uma query só, reaproveitada por login/gates.
export async function obterSessaoCompleta(request: Request, env: Env): Promise<SessaoCompleta | null> {
  try {
    const cookies = request.headers.get("cookie") || "";
    const sessionIdMatch = cookies.match(/session_id=([^;]*)/);
    if (!sessionIdMatch || !sessionIdMatch[1]) return null;

    const resultado = await env.DB.prepare(
      `SELECT c.id as corretor_id, c.papel, m.slug as minisite_slug, m.offline as minisite_offline, s.expira_em
       FROM sessoes s
       JOIN corretores c ON c.id = s.corretor_id
       LEFT JOIN minisites m ON m.corretor_id = c.id
       WHERE s.session_id = ?
       LIMIT 1`
    ).bind(sessionIdMatch[1]).first() as
      | { corretor_id: number; papel: string; minisite_slug: string | null; minisite_offline: number | null; expira_em: string }
      | null;

    // Comparação como Date (epoch ms), nunca como string — ver
    // src/lib/sessao.ts::obterCorretorAutenticado e o Histórico de Decisões
    // em project.md pro bug original (~24h de graça além do TTL).
    if (!resultado || new Date(resultado.expira_em) <= new Date()) return null;

    return {
      corretor_id: resultado.corretor_id,
      papel: resultado.papel === "superadmin" ? "superadmin" : "corretor",
      minisite_slug: resultado.minisite_slug,
      minisite_liberado: resultado.minisite_slug !== null && !resultado.minisite_offline,
    };
  } catch (erro) {
    console.error("Erro ao resolver sessão completa:", erro);
    return null;
  }
}

// URL absoluta pra onde a sessão dada deve ser levada após login (ou ao
// tentar acessar o painel errado já autenticado).
export function calcularDestinoPosLogin(sessao: SessaoCompleta): string {
  if (sessao.papel === "superadmin") {
    return `https://${DOMINIO_RAIZ}/painel-admin/`;
  }
  if (sessao.minisite_liberado && sessao.minisite_slug) {
    return `https://${sessao.minisite_slug}.${DOMINIO_RAIZ}/painel/`;
  }
  return `https://${DOMINIO_RAIZ}/painel/`;
}
