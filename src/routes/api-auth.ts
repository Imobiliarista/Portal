// Rotas de autenticação: pré-cadastro, login, recuperação de senha, logout
// Conforme seção 6.1 e 6.2 do project.md
// POST/GET /api/auth/*

import { Env } from "../index";
import { Corretor, PreCadastro, RespostaLogin } from "../types/modelos";
import { validarCPF, normalizarCPF } from "../lib/cpf";
import { hashSenha, verificarSenha } from "../lib/senha";

// ========== Auxiliares ==========

// Extrai e valida o IP do cliente
function obterIPCliente(request: Request): string {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "desconhecido";
}

// Versão do documento de termos aceito (formato: "1.0.0")
const VERSAO_TERMOS_ATUAL = "1.0.0";

// Mapa em memória para rastreamento de força bruta (por requisição)
// Em produção com múltiplas instâncias, usar Durable Objects ou D1
interface TentativaLogin {
  ip: string;
  falhas: number;
  bloqueado_ate: number; // timestamp ms
}

const tentativasLogin: Map<string, TentativaLogin> = new Map();

// Limpa tentativas expiradas e retorna se IP está bloqueado
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

// Registra falha de login
function registrarFalhaLogin(ip: string): void {
  const agora = Date.now();
  const tentativa = tentativasLogin.get(ip);

  if (!tentativa) {
    tentativasLogin.set(ip, {
      ip,
      falhas: 1,
      bloqueado_ate: agora + 60_000, // 1 minuto
    });
  } else {
    tentativa.falhas += 1;
    // Progressão: 1 min, 5 min, 15 min...
    if (tentativa.falhas >= 5) {
      tentativa.bloqueado_ate = agora + 900_000; // 15 minutos
    } else if (tentativa.falhas >= 3) {
      tentativa.bloqueado_ate = agora + 300_000; // 5 minutos
    } else {
      tentativa.bloqueado_ate = agora + 60_000; // 1 minuto
    }
  }
}

// Limpa falhas após sucesso de login
function limparFalhasLogin(ip: string): void {
  tentativasLogin.delete(ip);
}

// ========== Validação de Turnstile ==========

// Valida token do Cloudflare Turnstile
async function validarTurnstile(token: string, env: Env): Promise<boolean> {
  try {
    // Chave secreta do Turnstile será armazenada em wrangler.toml como secret
    const secretKey = (env as any).TURNSTILE_SECRET_KEY;
    if (!secretKey) {
      console.warn("TURNSTILE_SECRET_KEY não configurado");
      return false;
    }

    const response = await fetch("https://challenges.cloudflare.com/turnstile/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
      }),
    });

    if (!response.ok) return false;

    const resultado = await response.json() as { success: boolean };
    return resultado.success === true;
  } catch {
    return false;
  }
}

// ========== Rotas ==========

// POST /api/auth/pre-cadastro
// Pré-cadastro público com Turnstile e aceite de termos obrigatório
async function handlePreCadastro(request: Request, env: Env): Promise<Response> {
  try {
    const dados = await request.json() as {
      nome: string;
      email: string;
      telefone: string;
      creci: string;
      senha: string;
      turnstile_token: string;
      aceita_termos: boolean;
    };

    // Validação de entrada
    if (!dados.nome?.trim()) {
      return new Response(JSON.stringify({ erro: "Nome é obrigatório" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (!dados.email?.includes("@")) {
      return new Response(JSON.stringify({ erro: "E-mail inválido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (!dados.telefone?.trim()) {
      return new Response(JSON.stringify({ erro: "Telefone é obrigatório" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (!dados.creci?.trim()) {
      return new Response(JSON.stringify({ erro: "CRECI é obrigatório" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (!dados.senha || dados.senha.length < 8) {
      return new Response(JSON.stringify({ erro: "Senha deve ter no mínimo 8 caracteres" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (dados.aceita_termos !== true) {
      return new Response(JSON.stringify({ erro: "Você deve aceitar os Termos de Uso e Política de Privacidade" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Validar Turnstile
    if (!await validarTurnstile(dados.turnstile_token, env)) {
      return new Response(JSON.stringify({ erro: "Validação Turnstile falhou" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Verificar se e-mail já existe
    const verificaEmail = await env.DB.prepare(
      "SELECT id FROM corretores WHERE email = ?"
    ).bind(dados.email.toLowerCase()).first();

    if (verificaEmail) {
      return new Response(JSON.stringify({ erro: "E-mail já cadastrado" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }

    // Hash da senha
    const { hash: senhaHash, salt: senhaSalt } = await hashSenha(dados.senha);

    // Timestamp do aceite
    const agora = new Date().toISOString();

    // Insere corretor (status 'pre-cadastro')
    const insertCorretor = await env.DB.prepare(
      `INSERT INTO corretores (
        nome_completo, email, telefone, creci,
        senha_hash, senha_salt,
        status, criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      dados.nome.trim(),
      dados.email.toLowerCase(),
      dados.telefone.trim(),
      dados.creci.trim(),
      senhaHash,
      senhaSalt,
      "pre-cadastro",
      agora,
      agora
    ).run();

    const corretorId = (insertCorretor.meta.last_row_id);

    // Insere pré-cadastro com aceite de termos
    await env.DB.prepare(
      `INSERT INTO pre_cadastros (
        nome, email, telefone, creci,
        aceite_termos_em, versao_termos_aceita,
        status, criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      dados.nome.trim(),
      dados.email.toLowerCase(),
      dados.telefone.trim(),
      dados.creci.trim(),
      agora,
      VERSAO_TERMOS_ATUAL,
      "pendente",
      agora,
      agora
    ).run();

    // Cria minisite offline (será ativado após aprovação)
    const slugMinisite = dados.nome.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
    await env.DB.prepare(
      `INSERT INTO minisites (
        corretor_id, slug, offline, criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?)`
    ).bind(
      corretorId,
      slugMinisite,
      true, // offline até aprovação
      agora,
      agora
    ).run();

    // Cria plano padrão
    await env.DB.prepare(
      `INSERT INTO planos (
        corretor_id, max_anuncios, max_fotos_por_anuncio, max_resolucao_upload_bytes,
        criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      corretorId,
      10, // padrão: 10 anúncios
      20, // 20 fotos por anúncio
      5_000_000, // 5 MB
      agora,
      agora
    ).run();

    return new Response(JSON.stringify({
      sucesso: true,
      mensagem: "Pré-cadastro realizado com sucesso. Você já pode fazer login.",
      corretor_id: corretorId,
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  } catch (erro) {
    console.error("Erro em pré-cadastro:", erro);
    return new Response(JSON.stringify({ erro: "Erro ao processar pré-cadastro" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// POST /api/auth/login
// Login com nome de usuário OU CPF + senha
async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const ip = obterIPCliente(request);

    // Verificar se IP está bloqueado
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

    // Busca corretor por nome_usuario OU CPF (normalizado)
    let corretor: any;

    // Tenta por nome_usuario primeiro
    corretor = await env.DB.prepare(
      "SELECT id, nome_completo, email, senha_hash, senha_salt, status FROM corretores WHERE nome_usuario = ?"
    ).bind(usuario).first();

    // Se não encontrou, tenta por CPF (normalizado)
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

    // Verifica senha
    const senhaValida = await verificarSenha(dados.senha, corretor.senha_hash, corretor.senha_salt);
    if (!senhaValida) {
      registrarFalhaLogin(ip);
      return new Response(JSON.stringify({ erro: "Usuário ou senha inválidos" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    // Sucesso: limpa falhas
    limparFalhasLogin(ip);

    // Cria sessão (cookie)
    // Nota: em produção, usar um token/session ID mais robusto armazenado em D1 ou Durable Objects
    const sessionId = `sess_${Math.random().toString(36).substring(2)}_${Date.now()}`;

    // Retorna resposta com Set-Cookie
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
        "set-cookie": `session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`, // 30 dias
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
// Remove sessão (limpa cookie)
async function handleLogout(_request: Request, _env: Env): Promise<Response> {
  return new Response(JSON.stringify({ sucesso: true, mensagem: "Logout realizado" }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": "session_id=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
    },
  });
}

// Rastreamento de tentativas de recuperação de senha por IP (proteção contra abuso)
interface TentativaRecuperacao {
  ip: string;
  tentativas: number;
  bloqueado_ate: number; // timestamp ms
}

const tentativasRecuperacao: Map<string, TentativaRecuperacao> = new Map();

// Verifica se IP está bloqueado para recuperação de senha
function verificarBloqueioRecuperacao(ip: string): boolean {
  const agora = Date.now();
  const tentativa = tentativasRecuperacao.get(ip);

  if (!tentativa) return false;

  if (agora > tentativa.bloqueado_ate) {
    tentativasRecuperacao.delete(ip);
    return false;
  }

  return true;
}

// Registra tentativa de recuperação de senha
function registrarTentativaRecuperacao(ip: string): void {
  const agora = Date.now();
  const tentativa = tentativasRecuperacao.get(ip);

  if (!tentativa) {
    tentativasRecuperacao.set(ip, {
      ip,
      tentativas: 1,
      bloqueado_ate: agora + 3600_000, // 1 hora
    });
  } else {
    tentativa.tentativas += 1;
    if (tentativa.tentativas >= 5) {
      tentativa.bloqueado_ate = agora + 3600_000; // 1 hora após 5 tentativas
    }
  }
}

// Envia e-mail de redefinição de senha via Resend
async function enviarEmailRecuperacaoSenha(
  email: string,
  token: string,
  nomeCorretor: string,
  dominio: string
): Promise<boolean> {
  const resendApiKey = (globalThis as any).RESEND_API_KEY || process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    console.error("RESEND_API_KEY não configurada");
    return false;
  }

  const linkRedefinicao = `https://${dominio}/redefinir-senha?token=${token}`;
  const corpoHtml = `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <h2>Redefinir Senha</h2>
        <p>Olá ${nomeCorretor},</p>
        <p>Você solicitou a redefinição de sua senha. Clique no link abaixo para criar uma nova senha:</p>

        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <a href="${linkRedefinicao}" style="background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
            Redefinir Senha
          </a>
        </div>

        <p style="font-size: 12px; color: #666;">Se o botão acima não funcionar, copie e cole este link no navegador:</p>
        <p style="font-size: 12px; color: #666; word-break: break-all;">${linkRedefinicao}</p>

        <p style="font-size: 12px; color: #666; margin-top: 20px;">Este link expira em 1 hora.</p>
        <p style="font-size: 12px; color: #666;">Se você não solicitou esta redefinição, ignore este e-mail.</p>

        <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
          Atenciosamente,<br/>
          <strong>Imobiliarista.net</strong>
        </p>
      </body>
    </html>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "recuperacao@imobiliarista.net",
        to: email,
        subject: "Redefinir sua senha no Imobiliarista.net",
        html: corpoHtml,
      }),
    });

    if (!response.ok) {
      console.error(`Erro ao enviar e-mail: ${response.status} ${response.statusText}`);
      return false;
    }

    return true;
  } catch (erro) {
    console.error("Erro ao enviar e-mail de recuperação:", erro);
    return false;
  }
}

// POST /api/auth/recuperacao-senha
// Inicia fluxo de recuperação de senha
async function handleRecuperacaoSenha(request: Request, env: Env): Promise<Response> {
  try {
    const ip = obterIPCliente(request);

    // Verificar se IP está bloqueado (proteção contra abuso)
    if (verificarBloqueioRecuperacao(ip)) {
      return new Response(JSON.stringify({
        erro: "Muitas tentativas de recuperação de senha. Tente novamente mais tarde.",
      }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    }

    const dados = await request.json() as { email: string };

    if (!dados.email?.includes("@")) {
      registrarTentativaRecuperacao(ip);
      return new Response(JSON.stringify({ erro: "E-mail inválido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Busca corretor por e-mail
    const corretor = await env.DB.prepare(
      "SELECT id, email, nome_completo FROM corretores WHERE email = ?"
    ).bind(dados.email.toLowerCase()).first();

    if (!corretor) {
      // Não revela se e-mail existe (por segurança)
      registrarTentativaRecuperacao(ip);
      return new Response(JSON.stringify({
        sucesso: true,
        mensagem: "Se o e-mail estiver cadastrado, um link de redefinição será enviado.",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Gera token de redefinição (válido por 1 hora)
    const tokenRedefinicao = `reset_${Math.random().toString(36).substring(2)}_${Date.now()}`;
    const expiracao = new Date(Date.now() + 3600_000); // 1 hora

    // Armazena token na tabela de redefinições de senha
    await env.DB.prepare(
      `INSERT INTO reset_tokens_senha (corretor_id, token, expira_em, usado)
       VALUES (?, ?, ?, ?)`
    ).bind(
      corretor.id,
      tokenRedefinicao,
      expiracao.toISOString(),
      false
    ).run();

    // Obtém domínio da requisição para gerar link correto
    const urlOrigem = new URL(request.url);
    const dominio = urlOrigem.hostname;

    // Envia e-mail com link de redefinição
    await enviarEmailRecuperacaoSenha(
      corretor.email,
      tokenRedefinicao,
      corretor.nome_completo,
      dominio
    );

    return new Response(JSON.stringify({
      sucesso: true,
      mensagem: "Se o e-mail estiver cadastrado, um link de redefinição será enviado.",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (erro) {
    console.error("Erro em recuperação de senha:", erro);
    return new Response(JSON.stringify({ erro: "Erro ao processar solicitação" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// POST /api/auth/redefinir-senha
// Valida token e define nova senha
async function handleRedefinirSenha(request: Request, env: Env): Promise<Response> {
  try {
    const dados = await request.json() as {
      token: string;
      nova_senha: string;
    };

    if (!dados.token?.trim()) {
      return new Response(JSON.stringify({ erro: "Token inválido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (!dados.nova_senha || dados.nova_senha.length < 8) {
      return new Response(JSON.stringify({ erro: "Senha deve ter no mínimo 8 caracteres" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Busca token na tabela de redefinições
    const tokenRecord = await env.DB.prepare(
      `SELECT id, corretor_id, token, expira_em, usado
       FROM reset_tokens_senha
       WHERE token = ?`
    ).bind(dados.token.trim()).first();

    if (!tokenRecord) {
      return new Response(JSON.stringify({ erro: "Token inválido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Verifica se token foi usado
    if (tokenRecord.usado) {
      return new Response(JSON.stringify({ erro: "Token já foi utilizado" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Verifica se token expirou
    const agora = new Date();
    const expiraEm = new Date(tokenRecord.expira_em);

    if (agora > expiraEm) {
      return new Response(JSON.stringify({ erro: "Token expirou" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Hash da nova senha
    const { hash: senhaHash, salt: senhaSalt } = await hashSenha(dados.nova_senha);

    // Atualiza senha do corretor
    await env.DB.prepare(
      `UPDATE corretores
       SET senha_hash = ?, senha_salt = ?, atualizado_em = ?
       WHERE id = ?`
    ).bind(
      senhaHash,
      senhaSalt,
      new Date().toISOString(),
      tokenRecord.corretor_id
    ).run();

    // Marca token como usado
    await env.DB.prepare(
      `UPDATE reset_tokens_senha
       SET usado = ?
       WHERE id = ?`
    ).bind(true, tokenRecord.id).run();

    return new Response(JSON.stringify({
      sucesso: true,
      mensagem: "Senha redefinida com sucesso. Você já pode fazer login com a nova senha.",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (erro) {
    console.error("Erro ao redefinir senha:", erro);
    return new Response(JSON.stringify({ erro: "Erro ao processar solicitação" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// GET /api/auth/sessao
// Valida sessão e retorna dados do corretor
async function handleVerificacaoSessao(request: Request, env: Env): Promise<Response> {
  try {
    // Extrai cookie session_id
    const cookies = request.headers.get("cookie") || "";
    const sessionIdMatch = cookies.match(/session_id=([^;]*)/);

    if (!sessionIdMatch || !sessionIdMatch[1]) {
      return new Response(JSON.stringify({ autenticado: false }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    // Nota: em produção, validar sessionId contra tabela de sessões em D1
    // Por enquanto, retornar erro (sessão não persistida)
    return new Response(JSON.stringify({ autenticado: false }), {
      status: 401,
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

// ========== Roteador principal ==========

export async function rotasAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const metodo = request.method;
  const caminho = url.pathname;

  if (metodo === "POST" && caminho === "/api/auth/pre-cadastro") {
    return handlePreCadastro(request, env);
  }

  if (metodo === "POST" && caminho === "/api/auth/login") {
    return handleLogin(request, env);
  }

  if (metodo === "POST" && caminho === "/api/auth/logout") {
    return handleLogout(request, env);
  }

  if (metodo === "POST" && caminho === "/api/auth/recuperacao-senha") {
    return handleRecuperacaoSenha(request, env);
  }

  if (metodo === "POST" && caminho === "/api/auth/redefinir-senha") {
    return handleRedefinirSenha(request, env);
  }

  if (metodo === "GET" && caminho === "/api/auth/sessao") {
    return handleVerificacaoSessao(request, env);
  }

  return new Response(JSON.stringify({ erro: "Rota não encontrada" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
