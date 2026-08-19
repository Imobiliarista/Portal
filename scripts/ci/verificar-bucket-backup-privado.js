#!/usr/bin/env node
// Guardrail — falha o build se o bucket do backup mensal do D1
// (BACKUP_PRIVADO / "imob-backup-privado", ver src/scheduled.ts e
// wrangler.toml) tiver Custom Domain ou r2.dev (domínio "managed")
// habilitado. Esse bucket contém senha_hash, CPF e tokens de sessão —
// nunca deve ser acessível publicamente. Ver project.md, Histórico de
// Decisões, incidente de segurança R2 (2026-08-19).
//
// TAREFA MANUAL — este script não roda sozinho no CI hospedado (sandbox
// deste ambiente não tem credencial Cloudflare pra chamar a API real, e
// nunca deve simular um resultado). Pra ativar de verdade:
//
//   1. Criar um API Token na Cloudflare (dash.cloudflare.com > My Profile
//      > API Tokens) com permissão "Account > Workers R2 Storage > Read"
//      (leitura basta — este script não altera nada).
//   2. Configurar dois Secrets no repositório GitHub
//      (Settings > Secrets and variables > Actions):
//        CLOUDFLARE_API_TOKEN
//        CLOUDFLARE_ACCOUNT_ID
//   3. O passo já está referenciado em .github/workflows/ci.yml, guardado
//      por `if: secrets.CLOUDFLARE_API_TOKEN != ''` — sem os secrets
//      configurados, o passo é pulado (com aviso), não falha nem finge
//      que passou. Depois do passo 2, ele passa a rodar de verdade em
//      todo PR.
//
// Uso manual (fora do CI, com as duas env vars já exportadas):
//   node scripts/ci/verificar-bucket-backup-privado.js

const BUCKET_NAME = process.env.BUCKET_BACKUP_NOME || "imob-backup-privado";
const API_BASE = "https://api.cloudflare.com/client/v4";

function erroFatal(mensagem) {
  console.error(`❌ ${mensagem}`);
  process.exit(1);
}

async function chamarApiCloudflare(caminho, token) {
  const resposta = await fetch(`${API_BASE}${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const corpo = await resposta.json();

  if (!resposta.ok || corpo.success === false) {
    const detalhe = JSON.stringify(corpo.errors ?? corpo);
    throw new Error(
      `Chamada à API Cloudflare falhou (${resposta.status}) em ${caminho}: ${detalhe}`,
    );
  }

  return corpo.result;
}

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!token || !accountId) {
    erroFatal(
      "CLOUDFLARE_API_TOKEN e/ou CLOUDFLARE_ACCOUNT_ID não configurados. " +
        "Este script não deve rodar sem credencial real — configure os Secrets " +
        "no repositório (ver comentário no topo deste arquivo) antes de habilitar " +
        "o passo no CI.",
    );
  }

  console.log(`Verificando acesso público do bucket "${BUCKET_NAME}"...`);

  const problemas = [];

  try {
    const dominiosCustom = await chamarApiCloudflare(
      `/accounts/${accountId}/r2/buckets/${BUCKET_NAME}/domains/custom`,
      token,
    );
    const listaDominios = dominiosCustom?.domains ?? [];
    const dominiosAtivos = listaDominios.filter((d) => d.enabled);

    if (dominiosAtivos.length > 0) {
      problemas.push(
        `Custom Domain habilitado: ${dominiosAtivos.map((d) => d.domain).join(", ")}`,
      );
    }
  } catch (erro) {
    erroFatal(`Não foi possível checar Custom Domain do bucket: ${erro.message}`);
  }

  try {
    const dominioManaged = await chamarApiCloudflare(
      `/accounts/${accountId}/r2/buckets/${BUCKET_NAME}/domains/managed`,
      token,
    );

    if (dominioManaged?.enabled) {
      problemas.push(`URL pública r2.dev habilitada: ${dominioManaged.domain ?? "(sem domínio informado)"}`);
    }
  } catch (erro) {
    erroFatal(`Não foi possível checar r2.dev do bucket: ${erro.message}`);
  }

  if (problemas.length > 0) {
    console.error(`❌ Bucket "${BUCKET_NAME}" está acessível publicamente:`);
    for (const problema of problemas) {
      console.error(`   - ${problema}`);
    }
    console.error(
      "Este bucket recebe o export mensal do D1 (senha_hash, CPF, tokens de sessão) " +
        "e nunca deve ter acesso público. Desabilite no painel Cloudflare " +
        "(R2 > imob-backup-privado > Settings) antes de mergear.",
    );
    process.exit(1);
  }

  console.log(`✅ Bucket "${BUCKET_NAME}" está privado (sem Custom Domain nem r2.dev).`);
}

main().catch((erro) => erroFatal(erro.stack ?? String(erro)));
