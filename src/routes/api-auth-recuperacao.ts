// Recuperação de senha: envio de link, redefinição
// POST /api/auth/recuperacao-senha, /api/auth/redefinir-senha

import { Env } from "../index";
import { hashSenha } from "../lib/senha";

// Rastreamento de tentativas de recuperação por IP
interface TentativaRecuperacao {
  ip: string;
  tentativas: number;
  bloqueado_ate: number;
}

const tentativasRecuperacao: Map<string, TentativaRecuperacao> = new Map();

function obterIPCliente(request: Request): string {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "desconhecido";
}

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

function registrarTentativaRecuperacao(ip: string): void {
  const agora = Date.now();
  const tentativa = tentativasRecuperacao.get(ip);

  if (!tentativa) {
    tentativasRecuperacao.set(ip, {
      ip,
      tentativas: 1,
      bloqueado_ate: agora + 3600_000,
    });
  } else {
    tentativa.tentativas += 1;
    if (tentativa.tentativas >= 5) {
      tentativa.bloqueado_ate = agora + 3600_000;
    }
  }
}

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

    const corretor = await env.DB.prepare(
      "SELECT id, email, nome_completo FROM corretores WHERE email = ?"
    ).bind(dados.email.toLowerCase()).first<{ id: number; email: string; nome_completo: string }>();

    if (!corretor) {
      registrarTentativaRecuperacao(ip);
      return new Response(JSON.stringify({
        sucesso: true,
        mensagem: "Se o e-mail estiver cadastrado, um link de redefinição será enviado.",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const tokenRedefinicao = `reset_${Math.random().toString(36).substring(2)}_${Date.now()}`;
    const expiracao = new Date(Date.now() + 3600_000);

    await env.DB.prepare(
      `INSERT INTO reset_tokens_senha (corretor_id, token, expira_em, usado)
       VALUES (?, ?, ?, ?)`
    ).bind(
      corretor.id,
      tokenRedefinicao,
      expiracao.toISOString(),
      false
    ).run();

    const urlOrigem = new URL(request.url);
    const dominio = urlOrigem.hostname;

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

    const tokenRecord = await env.DB.prepare(
      `SELECT id, corretor_id, token, expira_em, usado
       FROM reset_tokens_senha
       WHERE token = ?`
    ).bind(dados.token.trim()).first<{ id: number; corretor_id: number; token: string; expira_em: string; usado: number | boolean }>();

    if (!tokenRecord) {
      return new Response(JSON.stringify({ erro: "Token inválido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (tokenRecord.usado) {
      return new Response(JSON.stringify({ erro: "Token já foi utilizado" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const agora = new Date();
    const expiraEm = new Date(tokenRecord.expira_em);

    if (agora > expiraEm) {
      return new Response(JSON.stringify({ erro: "Token expirou" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const { hash: senhaHash, salt: senhaSalt } = await hashSenha(dados.nova_senha);

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

export { handleRecuperacaoSenha, handleRedefinirSenha };
