// Autenticação: login, logout, verificação de sessão
// POST/GET /api/auth/login, /api/auth/logout, /api/auth/sessao

import { Env } from "../index";
import { verificarSenha } from "../lib/senha";
import { validarCPF, normalizarCPF } from "../lib/cpf";
import { obterCorretorAutenticado } from "../lib/sessao";

// Duração da sessão — mantida em segundos pra ficar em sincronia com o
// Max-Age do cookie (seção 6.2 do project.md).
const DURACAO_SESSAO_SEGUNDOS = 2592000; // 30 dias

// Extrai e valida o IP do cliente
function obterIPCliente(request: Request): string {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "desconhecido";
}

// Mapa em memória para rastreamento de força bruta (por requisição)
// Em produção com múltiplas instâncias, usar Durable Objects ou D1
interface TentativaLogin {
  ip: string;
  falhas: number;
  bloqueado_ate: number;
}

const tentativasLogin: Map<string, TentativaLogin> = new Map();

function verificarBloqueio(ip: string): boolean {
  const agora = Date.now();
  const tentativa = tentativasLogin.get(ip);

  if (!tentativa) return false;

  if (agora > tentativa.bloqueado_ate) {
    tentativasLogin.delete(ip);
    return false;
  }

  return true;
}

function registrarFalhaLogin(ip: string): void {
  const agora = Date.now();
  const tentativa = tentativasLogin.get(ip);

  if (!tentativa) {
    tentativasLogin.set(ip, {
      ip,
      falhas: 1,
      bloqueado_ate: agora + 60_000,
    });
  } else {
    tentativa.falhas += 1;
    if (tentativa.falhas >= 5) {
      tentativa.bloqueado_ate = agora + 900_000;
    } else if (tentativa.falhas >= 3) {
      tentativa.bloqueado_ate = agora + 300_000;
    } else {
      tentativa.bloqueado_ate = agora + 60_000;
    }
  }
}

function limparFalhasLogin(ip: string): void {
  tentativasLogin.delete(ip);
}

// POST /api/auth/login
// Login com nome de usuário OU CPF + senha
async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const ip = obterIPCliente(request);

    if (verificarBloqueio(ip)) {
      return new Response(JSON.stringify({ erro: "Muitas tentativas falhas. Tente novamente mais tarde." }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    }

    const dados = await request.json() as {
      usuario: string;
      senha: string;
    };

    if (!dados.usuario?.trim() || !dados.senha?.trim()) {
      return new Response(JSON.stringify({ erro: "Usuário e senha são obrigatórios" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const usuario = dados.usuario.trim();

    let corretor: any;

    corretor = await env.DB.prepare(
      "SELECT id, nome_completo, email, senha_hash, senha_salt, status FROM corretores WHERE nome_usuario = ?"
    ).bind(usuario).first();

    if (!corretor) {
      const cpfNormalizado = normalizarCPF(usuario);
      if (validarCPF(cpfNormalizado)) {
        corretor = await env.DB.prepare(
          "SELECT id, nome_completo, email, senha_hash, senha_salt, status FROM corretores WHERE cpf = ?"
        ).bind(cpfNormalizado).first();
      }
    }

    if (!corretor) {
      registrarFalhaLogin(ip);
      return new Response(JSON.stringify({ erro: "Usuário ou senha inválidos" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const senhaValida = await verificarSenha(dados.senha, corretor.senha_hash, corretor.senha_salt);
    if (!senhaValida) {
      registrarFalhaLogin(ip);
      return new Response(JSON.stringify({ erro: "Usuário ou senha inválidos" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    limparFalhasLogin(ip);

    const sessionId = `sess_${Math.random().toString(36).substring(2)}_${Date.now()}`;
    const expiraEm = new Date(Date.now() + DURACAO_SESSAO_SEGUNDOS * 1000).toISOString();
    const userAgent = request.headers.get("user-agent") || undefined;

    // Persiste a sessão no D1 — sem isso, o cookie devolvido ao corretor
    // não corresponde a nenhuma sessão válida (seção 6.2: sessão via
    // cookie validada contra registro no D1).
    await env.DB.prepare(
      `INSERT INTO sessoes (corretor_id, session_id, ip_address, user_agent, expira_em, criado_em)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(corretor.id, sessionId, ip, userAgent || null, expiraEm).run();

    return new Response(JSON.stringify({
      sucesso: true,
      mensagem: "Login realizado com sucesso",
      corretor_id: corretor.id,
      nome_completo: corretor.nome_completo,
      email: corretor.email,
      status: corretor.status,
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": `session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACAO_SESSAO_SEGUNDOS}`,
      },
    });
  } catch (erro) {
    console.error("Erro em login:", erro);
    return new Response(JSON.stringify({ erro: "Erro ao processar login" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// POST /api/auth/logout
// Revoga a sessão no D1 (seção 6.2: mais fácil de revogar que JWT) e limpa o cookie
async function handleLogout(request: Request, env: Env): Promise<Response> {
  try {
    const cookies = request.headers.get("cookie") || "";
    const sessionIdMatch = cookies.match(/session_id=([^;]*)/);

    if (sessionIdMatch && sessionIdMatch[1]) {
      await env.DB.prepare("DELETE FROM sessoes WHERE session_id = ?").bind(sessionIdMatch[1]).run();
    }
  } catch (erro) {
    console.error("Erro ao revogar sessão:", erro);
  }

  return new Response(JSON.stringify({ sucesso: true, mensagem: "Logout realizado" }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": "session_id=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
    },
  });
}

// GET /api/auth/sessao
// Valida sessão contra o D1 e retorna dados do corretor
async function handleVerificacaoSessao(request: Request, env: Env): Promise<Response> {
  try {
    const corretorId = await obterCorretorAutenticado(request, env);

    if (!corretorId) {
      return new Response(JSON.stringify({ autenticado: false }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const corretor = await env.DB.prepare(
      "SELECT id, nome_completo, email, status FROM corretores WHERE id = ? LIMIT 1"
    ).bind(corretorId).first() as { id: number; nome_completo: string; email: string; status: string } | null;

    if (!corretor) {
      return new Response(JSON.stringify({ autenticado: false }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      autenticado: true,
      corretor_id: corretor.id,
      nome_completo: corretor.nome_completo,
      email: corretor.email,
      status: corretor.status,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (erro) {
    console.error("Erro em verificação de sessão:", erro);
    return new Response(JSON.stringify({ erro: "Erro ao validar sessão" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export { handleLogin, handleLogout, handleVerificacaoSessao };
