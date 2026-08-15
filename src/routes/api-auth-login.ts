// Autenticação: login, logout, verificação de sessão
// POST/GET /api/auth/login, /api/auth/logout, /api/auth/sessao

import { Env } from "../index";
import { verificarSenha } from "../lib/senha";
import { validarCPF, normalizarCPF } from "../lib/cpf";
import { obterCorretorAutenticado } from "../lib/sessao";
import { obterSessaoCompleta, calcularDestinoPosLogin } from "../lib/sessao-destino";

// Domínio explícito no cookie (em vez de host-only) — necessário pro mesmo
// session_id valer tanto na raiz (imobiliarista.net) quanto no subdomínio
// do corretor (nome.imobiliarista.net/painel/), já que o login pode
// acontecer em qualquer um dos dois e o redirecionamento pós-login troca
// de host. Sem isso, logar na raiz e cair no próprio subdomínio (redirect
// do "Login real + redirecionamento por sessão") chegaria lá sem cookie
// nenhum.
const COOKIE_BASE = "Path=/; Domain=imobiliarista.net; HttpOnly; Secure; SameSite=Strict";

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
  falhas: number;
  bloqueado_ate: number; // 0 = não bloqueado
  expira_em: number; // quando a contagem de falhas é descartada por inatividade
}

const tentativasLogin: Map<string, TentativaLogin> = new Map();

// Piso definido pelo dono do produto: só bloqueia a partir da 10ª falha
// consecutiva, pra não pegar cliente real errando a senha uma ou duas vezes.
const LIMITE_TENTATIVAS = 10;
const DURACAO_BLOQUEIO_MS = 900_000; // 15 minutos
const JANELA_INATIVIDADE_MS = 900_000; // reseta a contagem se ficar 15min sem nova falha

function verificarBloqueio(ip: string): boolean {
  const agora = Date.now();
  const tentativa = tentativasLogin.get(ip);

  if (!tentativa) return false;

  if (tentativa.bloqueado_ate > 0 && agora < tentativa.bloqueado_ate) {
    return true;
  }

  if (agora > tentativa.expira_em) {
    tentativasLogin.delete(ip);
  }

  return false;
}

function registrarFalhaLogin(ip: string): void {
  const agora = Date.now();
  const tentativa = tentativasLogin.get(ip);

  if (!tentativa || agora > tentativa.expira_em) {
    tentativasLogin.set(ip, {
      falhas: 1,
      bloqueado_ate: 0,
      expira_em: agora + JANELA_INATIVIDADE_MS,
    });
    return;
  }

  tentativa.falhas += 1;
  tentativa.expira_em = agora + JANELA_INATIVIDADE_MS;
  if (tentativa.falhas >= LIMITE_TENTATIVAS) {
    tentativa.bloqueado_ate = agora + DURACAO_BLOQUEIO_MS;
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

    // COLLATE NOCASE: nome_usuario é comparado sem diferenciar
    // maiúsculas/minúsculas no login — sem isso, um corretor cadastrado
    // como "ADMIN" não consegue entrar digitando "admin" (comparação
    // binária padrão do SQLite/D1, já que a coluna não tem NOCASE no
    // schema). Cadastro/unicidade continuam case-sensitive; se dois
    // usuários coexistirem só diferindo em caixa, o login pega o primeiro
    // que a query encontrar — cenário não esperado em uso normal.
    corretor = await env.DB.prepare(
      "SELECT id, nome_completo, email, senha_hash, senha_salt, status FROM corretores WHERE nome_usuario = ? COLLATE NOCASE"
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

    // Destino pós-login (superadmin, corretor liberado no próprio
    // subdomínio, ou corretor pendente na raiz) — mesma regra usada pelos
    // gates de /painel*/painel-admin* (src/lib/sessao-destino.ts), pra
    // login.js nunca decidir isso por conta própria.
    const sessaoRecemCriada = await obterSessaoCompleta(
      new Request(request.url, { headers: { cookie: `session_id=${sessionId}` } }),
      env,
    );
    const redirectTo = sessaoRecemCriada ? calcularDestinoPosLogin(sessaoRecemCriada) : "/";

    return new Response(JSON.stringify({
      sucesso: true,
      mensagem: "Login realizado com sucesso",
      corretor_id: corretor.id,
      nome_completo: corretor.nome_completo,
      email: corretor.email,
      status: corretor.status,
      redirect_to: redirectTo,
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": `session_id=${sessionId}; ${COOKIE_BASE}; Max-Age=${DURACAO_SESSAO_SEGUNDOS}`,
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
      // Domain precisa bater exatamente com o cookie setado no login —
      // navegador trata Domain diferente como cookie diferente, então sem
      // isso o cookie cross-subdomínio nunca seria de fato apagado.
      "set-cookie": `session_id=; ${COOKIE_BASE}; Max-Age=0`,
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

    // redirect_to: usado por login.js pra pular o formulário e já mandar
    // quem chega em /login/ com sessão válida pro painel certo (raiz ou
    // subdomínio, conforme papel/minisite — src/lib/sessao-destino.ts).
    const sessaoCompleta = await obterSessaoCompleta(request, env);
    const redirectTo = sessaoCompleta ? calcularDestinoPosLogin(sessaoCompleta) : null;

    return new Response(JSON.stringify({
      autenticado: true,
      corretor_id: corretor.id,
      nome_completo: corretor.nome_completo,
      email: corretor.email,
      status: corretor.status,
      redirect_to: redirectTo,
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
