#!/usr/bin/env node
// scripts/bootstrap-special-accounts.js
//
// CLI manual, de execução única, para provisionar (ou rotacionar) a senha
// inicial das duas contas especiais de homologação — MASTER e TESTE (§27
// hotfix pt.2, business/auth.js#SPECIAL_IDENTIFIERS,
// docs/OPERATIONS.md pendência 18). Nunca aceita senha como argumento de
// linha de comando nem hardcoded: sempre pergunta interativamente, com o
// terminal mudo (echo desligado) enquanto o usuário digita, para que a
// senha em texto puro nunca passe por histórico de shell, `ps`, nem log
// deste script.
//
// Deliberadamente NÃO reimplementa a derivação PBKDF2+pepper — chama
// business/auth.js#provisionSpecialAccount diretamente, a mesma função
// que o runbook de docs/OPERATIONS.md (pendência 18) já usa manualmente
// via console. Isso garante que o verificador gravado aqui é
// byte-a-byte o que business/auth.js#login espera comparar (mesmas
// 600k iterações PBKDF2 + HMAC-SHA256 com PASSWORD_PEPPER,
// core/auth.js#deriveClientPbkdf2/hashPbkdf2Result), sem duplicar essa
// lógica de segurança num segundo lugar.
//
// Usa `getPlatformProxy` do próprio wrangler para os bindings reais de R2
// (IMOB_PRIVATE) — mesma justificativa/convenção de scripts/rebuild-*.js
// (ver scripts/rebuild-listing.js). Não roda em CI, não é chamado por
// nenhum outro script: só manualmente, com `wrangler` autenticado
// apontando para o ambiente certo.
//
// Uso:
//   node scripts/bootstrap-special-accounts.js
//
// Secrets necessários (nunca hardcoded neste arquivo):
//   PASSWORD_PEPPER    — obrigatório. Lido de env.PASSWORD_PEPPER (o
//                         binding que getPlatformProxy resolve a partir de
//                         wrangler.toml/.dev.vars) ou, na ausência dele,
//                         de process.env.PASSWORD_PEPPER (exportado no
//                         shell antes de rodar o script). getPlatformProxy
//                         roda localmente (Miniflare) por padrão — um
//                         secret configurado só no dashboard Cloudflare
//                         (Workers & Pages > Configurações > "Runtime
//                         variables and secrets") não é visto por ele;
//                         exporte o mesmo valor no shell ou crie um
//                         `.dev.vars` local com PASSWORD_PEPPER=... antes
//                         de rodar.
//   LOGIN_INDEX_SECRET — só é lido/usado na primeira vez que a conta TESTE
//                         é provisionada (criação do corretor associado,
//                         business/brokers.js#createBroker) — e mesmo
//                         assim só seria exigido se o corretor de TESTE
//                         tivesse cpf/email, o que não é o caso aqui.
//                         Reprovisionar uma conta já existente nunca toca
//                         em índice de cpf/e-mail. Mesma resolução de
//                         env.LOGIN_INDEX_SECRET / process.env acima.

import { getPlatformProxy } from "wrangler";
import { createBroker, getBrokerBySlug } from "../business/brokers.js";
import { provisionSpecialAccount } from "../business/auth.js";
import { resolveSpecialLogin } from "../storage/indexes.js";

// Identidades fixas usadas quando uma conta é provisionada pela primeira
// vez — mesmos valores do runbook em docs/OPERATIONS.md (pendência 18),
// para manter esta CLI e a documentação em sincronia. Numa
// reprovisionamento (conta já existe), o script sempre reaproveita o
// userId/brokerId já gravados em vez de mintar um novo — trocar a senha
// nunca deve trocar a identidade por baixo.
const MASTER_USER_ID = "user_master_homolog";
const TESTE_BROKER_SEED = {
  userId: "user_teste_homolog",
  slug: "teste-homologacao", // "teste" sozinho é reservado — business/brokers.js#RESERVED_SLUGS
  name: "Conta de teste (homologação)",
  plan: "internal",
  status: "active",
};

function resolveSecret(env, name) {
  const value = env?.[name] ?? process.env[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Leitura de linha crua do stdin, com eco opcional — implementado à mão
// (em vez de `readline`) porque a máscara de senha exige alternar o modo
// raw do stdin por chamada, o que conflita com a própria instância
// interna de readline se ela também estiver escutando 'data'.
function readStdinLine({ echo }) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = Boolean(stdin.isRaw);
    const isTty = Boolean(stdin.isTTY);
    let input = "";

    if (isTty) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = () => {
      if (isTty) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdin.removeListener("data", onData);
    };

    function onData(chunk) {
      for (const char of chunk) {
        if (char === "\u0003") {
          // Ctrl+C — nunca engolir silenciosamente.
          cleanup();
          process.stdout.write("\n");
          process.exit(130);
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(input);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (input.length > 0) {
            input = input.slice(0, -1);
            if (echo) process.stdout.write("\b \b");
          }
          continue;
        }
        input += char;
        if (echo) process.stdout.write(char);
      }
    }
    stdin.on("data", onData);
  });
}

async function askVisible(question) {
  process.stdout.write(question);
  return (await readStdinLine({ echo: true })).trim();
}

async function askHidden(question) {
  process.stdout.write(question);
  return readStdinLine({ echo: false });
}

async function askConfirm(question) {
  const answer = await askVisible(`${question} (digite "sim" para confirmar): `);
  return answer.toLowerCase() === "sim";
}

// Pede a senha duas vezes (confirmação) para reduzir o risco de um typo
// silencioso virar a senha real de uma conta administrativa — inevitável
// já que a digitação é sempre muda. Retorna `null` se o usuário optar por
// pular (linha vazia na primeira pergunta).
async function askNewPassword(label) {
  const password = await askHidden(`Senha para ${label}: `);
  if (!password) return null;
  const confirmation = await askHidden(`Confirme a senha para ${label}: `);
  if (confirmation !== password) {
    throw new Error(`As senhas informadas para ${label} não coincidem.`);
  }
  return password;
}

async function provisionMaster(env, pepper) {
  const existing = await resolveSpecialLogin(env, "master");
  if (existing) {
    console.log('\nMASTER já provisionada (existe "indexes/login-special/master.json").');
    const overwrite = await askConfirm("Sobrescrever a senha da conta MASTER?");
    if (!overwrite) {
      console.log("MASTER mantida sem alteração.");
      return { changed: false };
    }
  } else {
    console.log("\nMASTER ainda não provisionada.");
  }

  const password = await askNewPassword("MASTER (superadministrador)");
  if (password === null) {
    console.log("Nenhuma senha informada — MASTER pulada.");
    return { changed: false };
  }

  const userId = existing?.userId ?? MASTER_USER_ID;
  const record = await provisionSpecialAccount(env, "MASTER", userId, password, { pepper });
  console.log(`MASTER provisionada (userId=${record.userId}, authVersion=${record.authVersion}, temporary=${record.temporary}).`);
  return { changed: true };
}

// Garante que o corretor associado a TESTE existe, reaproveitando o que já
// houver em vez de recriar — evita BrokerConflictError numa segunda
// rodada e preserva o brokerId (que aparece na claim de sessão emitida no
// login, business/auth.js#login).
async function ensureTesteBroker(env, loginIndexSecret, existingBrokerId) {
  if (existingBrokerId) return existingBrokerId;

  const bySlug = await getBrokerBySlug(env, TESTE_BROKER_SEED.slug);
  if (bySlug) {
    console.log(`Corretor "${TESTE_BROKER_SEED.slug}" já existe (brokerId=${bySlug.brokerId}) — reaproveitando.`);
    return bySlug.brokerId;
  }

  const broker = await createBroker(env, TESTE_BROKER_SEED, { loginIndexSecret, allowMissingCpf: true });
  console.log(`Corretor de TESTE criado (brokerId=${broker.brokerId}).`);
  return broker.brokerId;
}

async function provisionTeste(env, pepper, loginIndexSecret) {
  const existing = await resolveSpecialLogin(env, "teste");
  if (existing) {
    console.log('\nTESTE já provisionada (existe "indexes/login-special/teste.json").');
    const overwrite = await askConfirm("Sobrescrever a senha da conta TESTE?");
    if (!overwrite) {
      console.log("TESTE mantida sem alteração.");
      return { changed: false };
    }
  } else {
    console.log("\nTESTE ainda não provisionada.");
  }

  const password = await askNewPassword("TESTE (corretor/anunciante)");
  if (password === null) {
    console.log("Nenhuma senha informada — TESTE pulada.");
    return { changed: false };
  }

  const brokerId = await ensureTesteBroker(env, loginIndexSecret, existing?.brokerId);
  const userId = existing?.userId ?? TESTE_BROKER_SEED.userId;
  const record = await provisionSpecialAccount(env, "TESTE", userId, password, { pepper, brokerId });
  console.log(
    `TESTE provisionada (userId=${record.userId}, brokerId=${brokerId}, authVersion=${record.authVersion}, temporary=${record.temporary}).`,
  );
  return { changed: true };
}

async function main() {
  const { env, dispose } = await getPlatformProxy();
  try {
    const pepper = resolveSecret(env, "PASSWORD_PEPPER");
    if (!pepper) {
      throw new Error(
        "PASSWORD_PEPPER ausente. Configure em .dev.vars (lido por getPlatformProxy) ou exporte " +
          "PASSWORD_PEPPER no ambiente do shell antes de rodar este script — nunca hardcoded.",
      );
    }
    const loginIndexSecret = resolveSecret(env, "LOGIN_INDEX_SECRET");

    console.log("Bootstrap de contas especiais (MASTER/TESTE) — §27 hotfix pt.2.");
    console.log("As senhas digitadas nunca aparecem no terminal nem em nenhum log deste script.");

    const master = await provisionMaster(env, pepper);
    const teste = await provisionTeste(env, pepper, loginIndexSecret);

    console.log("\nResumo:");
    console.log(`  MASTER: ${master.changed ? "provisionada/atualizada" : "sem alteração"}`);
    console.log(`  TESTE:  ${teste.changed ? "provisionada/atualizada" : "sem alteração"}`);
    console.log(
      "\nAmbas as contas ficam marcadas temporary: true em indexes/login-special/{master,teste}.json — " +
        "trocar a senha ou desativar antes de produção definitiva é passo manual (docs/OPERATIONS.md, pendência 18).",
    );
  } finally {
    await dispose();
  }
}

main().catch((error) => {
  console.error(`\nErro: ${error.message}`);
  process.exitCode = 1;
});
