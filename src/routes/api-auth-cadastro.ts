// Pré-cadastro: formulário público, validação Turnstile, aceite de termos
// POST /api/auth/pre-cadastro

import { Env } from "../index";
import { hashSenha } from "../lib/senha";

const VERSAO_TERMOS_ATUAL = "1.0.0";

// Valida token do Cloudflare Turnstile
async function validarTurnstile(token: string, env: Env): Promise<boolean> {
  try {
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

    if (!await validarTurnstile(dados.turnstile_token, env)) {
      return new Response(JSON.stringify({ erro: "Validação Turnstile falhou" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const verificaEmail = await env.DB.prepare(
      "SELECT id FROM corretores WHERE email = ?"
    ).bind(dados.email.toLowerCase()).first();

    if (verificaEmail) {
      return new Response(JSON.stringify({ erro: "E-mail já cadastrado" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }

    const { hash: senhaHash, salt: senhaSalt } = await hashSenha(dados.senha);
    const agora = new Date().toISOString();

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

    const slugMinisite = dados.nome.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
    await env.DB.prepare(
      `INSERT INTO minisites (
        corretor_id, slug, offline, criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?)`
    ).bind(
      corretorId,
      slugMinisite,
      true,
      agora,
      agora
    ).run();

    await env.DB.prepare(
      `INSERT INTO planos (
        corretor_id, max_anuncios, max_fotos_por_anuncio, max_resolucao_upload_bytes,
        criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      corretorId,
      10,
      20,
      5_000_000,
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

export { handlePreCadastro };
