// Pré-cadastro: formulário público, validação Turnstile, aceite de termos
// POST /api/auth/pre-cadastro

import { Env } from "../index";
import { hashSenha } from "../lib/senha";
import { normalizarCPF } from "../lib/cpf";
import { enfileirarStatusMinisite } from "../jobs/gerar-status-minisite";
import { validarCamposCorretor, verificarUnicidadeCorretor } from "../lib/validacao-corretor";

const VERSAO_TERMOS_ATUAL = "1.0.0";

// Valida token do Cloudflare Turnstile
// Endpoint oficial (siteverify): https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
async function validarTurnstile(token: string, env: Env, remoteip?: string): Promise<boolean> {
  try {
    const secretKey = (env as any).TURNSTILE_SECRET_KEY;
    if (!secretKey) {
      console.warn("TURNSTILE_SECRET_KEY não configurado");
      return false;
    }

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
        remoteip,
      }),
    });

    if (!response.ok) return false;

    const resultado = await response.json() as { success: boolean; "error-codes"?: string[] };
    if (!resultado.success) {
      console.warn("Validação Turnstile recusada:", resultado["error-codes"]);
    }
    return resultado.success === true;
  } catch (erro) {
    console.error("Erro ao validar Turnstile:", erro);
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
      cpf: string;
      nome_usuario: string;
      sexo: string;
      data_nascimento: string;
      nacionalidade: string;
      endereco_residencial: string;
    };

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

    // Campos de identidade civil/profissional — imutáveis após o cadastro
    // (seção 6.1.1 do project.md): preenchidos aqui, travados dali em diante.
    // Validação compartilhada com a criação direta pelo Superadmin — ver
    // lib/validacao-corretor.ts.
    const erroValidacao = validarCamposCorretor(dados);
    if (erroValidacao) {
      return new Response(JSON.stringify({ erro: erroValidacao }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const cpfNormalizado = normalizarCPF(dados.cpf || "");

    const ipCliente = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || undefined;
    if (!await validarTurnstile(dados.turnstile_token, env, ipCliente)) {
      return new Response(JSON.stringify({ erro: "Validação Turnstile falhou" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const erroUnicidade = await verificarUnicidadeCorretor(env.DB, {
      email: dados.email,
      cpf: cpfNormalizado,
      nome_usuario: dados.nome_usuario,
      creci: dados.creci,
    });
    if (erroUnicidade) {
      return new Response(JSON.stringify({ erro: erroUnicidade }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }

    const { hash: senhaHash, salt: senhaSalt } = await hashSenha(dados.senha);
    const agora = new Date().toISOString();

    const insertCorretor = await env.DB.prepare(
      `INSERT INTO corretores (
        nome_completo, sexo, data_nascimento, nacionalidade, cpf, creci,
        nome_usuario, senha_hash, senha_salt,
        endereco_residencial, telefone, email,
        status, criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      dados.nome.trim(),
      dados.sexo.trim(),
      dados.data_nascimento.trim(),
      dados.nacionalidade.trim(),
      cpfNormalizado,
      dados.creci.trim(),
      dados.nome_usuario.trim(),
      senhaHash,
      senhaSalt,
      dados.endereco_residencial.trim(),
      dados.telefone.trim(),
      dados.email.toLowerCase(),
      "pre-cadastro",
      agora,
      agora
    ).run();

    const corretorId = (insertCorretor.meta.last_row_id);

    // `corretor_id` vincula este pré-cadastro à conta já criada acima —
    // usado por queries-superadmin.ts::aprovarPreCadastro pra PROMOVER o
    // mesmo registro (nunca criar um corretor duplicado na aprovação).
    await env.DB.prepare(
      `INSERT INTO pre_cadastros (
        corretor_id, nome, email, telefone, creci,
        aceite_termos_em, versao_termos_aceita,
        status, criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      corretorId,
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

    // Materializa tenants/{slug}/status.json em R2 (liberado=false, já
    // que offline=true acima) — routes/minisite.ts lê daqui, nunca de D1,
    // no caminho público. Ver jobs/gerar-status-minisite.ts.
    //
    // O cadastro em si já foi persistido em D1 acima — se a materialização
    // falhar aqui, não faz sentido reverter tudo e barrar o cadastro do
    // corretor. O site já nasce offline (minisite.offline=true) então o
    // impacto público imediato é nulo; e a aprovação do Superadmin
    // (routes/painel-superadmin.ts::rotaAprovarPreCadastro) chama o mesmo
    // enfileiramento de novo, dando uma segunda chance de materializar.
    let avisoMaterializacao: string | undefined;
    try {
      await enfileirarStatusMinisite(env, slugMinisite);
    } catch (erroFila) {
      const detalhe = erroFila instanceof Error ? erroFila.message : String(erroFila);
      console.error(`Pré-cadastro do corretor ${corretorId} salvo, mas falhou ao materializar status do minisite "${slugMinisite}" em R2:`, erroFila);
      avisoMaterializacao = `Cadastro salvo, mas a liberação inicial do site pode demorar um pouco mais (falha ao enfileirar: ${detalhe}). Isso não impede a aprovação — nossa equipe será notificada.`;
    }

    // Limites de anúncios/fotos vêm do Plano, atribuído no momento da
    // aprovação (ver queries-superadmin.ts::aprovarPreCadastro, Lote 14).
    // Aqui só é criada a configuração de upload padrão do corretor.
    await env.DB.prepare(
      `INSERT INTO config_upload_corretor (
        corretor_id, max_resolucao_upload_bytes,
        criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?)`
    ).bind(
      corretorId,
      5_000_000,
      agora,
      agora
    ).run();

    return new Response(JSON.stringify({
      sucesso: true,
      mensagem: "Pré-cadastro realizado com sucesso. Você já pode fazer login.",
      corretor_id: corretorId,
      ...(avisoMaterializacao ? { aviso: avisoMaterializacao } : {}),
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
