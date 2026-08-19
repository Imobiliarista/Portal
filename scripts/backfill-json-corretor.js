#!/usr/bin/env node
// scripts/backfill-json-corretor.js
//
// Backfill one-off — materializa corretores/{slug}.json (R2, bucket
// "imob-dados") pra todo corretor já aprovado que ainda não tem esse
// artefato.
//
// Causa raiz (ver project.md, Histórico de Decisões): o único gatilho que
// existe pra jobs/gerar-json-corretor.ts é uma mutação de anúncio
// (jobs/revalidacao-cruzada.ts, disparado por api-anuncios-crud.ts /
// api-anuncios-backup.ts). A aprovação do corretor nunca enfileirava essa
// geração — corrigido em routes/painel-superadmin.ts
// (enfileirarGeracaoJsonCorretor, chamado agora em rotaAprovarPreCadastro e
// rotaCriarMinisite). Mas essa correção só vale pra aprovações *daqui pra
// frente* — todo corretor aprovado *antes* dela, sem nenhum anúncio ainda
// cadastrado, continua sem corretores/{slug}.json até alguém criar/editar/
// excluir um anúncio dele (ou até este backfill rodar).
//
// Este script varre D1, checa existência em R2 e ENFILEIRA a geração pela
// mesma fila que o app usa (imob-queue, mensagem tipo "gerar-json-corretor")
// — não reimplementa a lógica de jobs/gerar-json-corretor.ts. Quem realmente
// gera o JSON continua sendo o consumer real (src/queue.ts, dentro do
// Worker), então o resultado é idêntico ao de qualquer geração normal.
//
// Ferramentas usadas, e por quê:
//   - `wrangler d1 execute` / `wrangler r2 object get` — CLI já autenticada
//     com a mesma credencial de sempre, mesmo padrão já usado neste repo em
//     scripts/db-seed/liberar-minisite-teste.sh.
//   - API HTTP da Cloudflare (fetch direto) só pra publicar mensagem na
//     fila — a wrangler CLI instalada aqui (4.124.x) NÃO tem
//     `wrangler queues producer send` nem equivalente (confirmado rodando
//     `wrangler queues --help`: só list/create/update/delete/info/consumer/
//     pause-delivery/resume-delivery/purge/subscription). O endpoint usado
//     abaixo (`POST /accounts/{account_id}/queues/{queue_id}/messages`) é a
//     API de push de mensagens da Cloudflare Queues — mesmo princípio de
//     scripts/ci/verificar-bucket-backup-privado.js (fetch direto só onde a
//     CLI não cobre).
//
// TAREFA MANUAL — este script NÃO deve ser rodado por este ambiente
// (sandbox sem CLOUDFLARE_API_TOKEN e sem `wrangler` autenticado contra a
// conta real; nunca simula um resultado). Quem rodar precisa:
//
//   1. `wrangler login` (ou WRANGLER_API_TOKEN) autenticado na conta certa
//      — usado pelos subprocessos `wrangler d1 execute` / `wrangler r2
//      object get`.
//   2. Exportar CLOUDFLARE_API_TOKEN (permissão "Account > Workers Queues >
//      Edit" — só isso, não precisa de D1/R2) e CLOUDFLARE_ACCOUNT_ID —
//      usados só pra publicar na fila.
//
// Uso (sempre rode sem --confirmar primeiro — modo dry-run é o padrão):
//   node scripts/backfill-json-corretor.js
//   node scripts/backfill-json-corretor.js --confirmar
//
// Idempotente: reenfileirar um corretor que já tem o JSON só regenera o
// mesmo conteúdo (processarGerarJsonCorretor sempre sobrescreve a partir do
// estado atual do D1) — rodar de novo por engano não corrompe nada.

import { execFileSync } from "node:child_process";

const DB = "imob-bd";
const BUCKET = "imob-dados";
const QUEUE_NOME = "imob-queue";
const API_BASE = "https://api.cloudflare.com/client/v4";

const CONFIRMAR = process.argv.includes("--confirmar");

function erroFatal(mensagem) {
  console.error(`❌ ${mensagem}`);
  process.exit(1);
}

function rodarWrangler(args) {
  return execFileSync("wrangler", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

function listarSlugsDeCorretoresAprovados() {
  const saida = rodarWrangler([
    "d1",
    "execute",
    DB,
    "--remote",
    "--json",
    "--command",
    "SELECT m.slug AS slug FROM minisites m JOIN corretores c ON c.id = m.corretor_id WHERE c.status = 'aprovado' ORDER BY m.slug",
  ]);

  const resultado = JSON.parse(saida);
  const linhas = resultado?.[0]?.results ?? [];
  return linhas.map((l) => l.slug).filter(Boolean);
}

function jsonCorretorExisteNoR2(slug) {
  try {
    execFileSync("wrangler", ["r2", "object", "get", `${BUCKET}/corretores/${slug}.json`, "--remote", "--pipe"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

async function chamarApiCloudflare(caminho, token, init) {
  const resposta = await fetch(`${API_BASE}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const corpo = await resposta.json();

  if (!resposta.ok || corpo.success === false) {
    const detalhe = JSON.stringify(corpo.errors ?? corpo);
    throw new Error(`Chamada à API Cloudflare falhou (${resposta.status}) em ${caminho}: ${detalhe}`);
  }

  return corpo.result;
}

async function resolverIdDaFila(accountId, token) {
  const filas = await chamarApiCloudflare(`/accounts/${accountId}/queues`, token);
  const fila = (filas ?? []).find((f) => f.queue_name === QUEUE_NOME || f.name === QUEUE_NOME);

  if (!fila) {
    erroFatal(
      `Fila "${QUEUE_NOME}" não encontrada na conta ${accountId}. Confira CLOUDFLARE_ACCOUNT_ID e se a fila já foi criada (wrangler.toml define o binding, mas a fila em si precisa existir na conta).`,
    );
  }

  return fila.queue_id ?? fila.id;
}

async function enfileirarGeracao(accountId, token, queueId, slug) {
  await chamarApiCloudflare(`/accounts/${accountId}/queues/${queueId}/messages`, token, {
    method: "POST",
    body: JSON.stringify({
      body: { tipo: "gerar-json-corretor", corretor_slug: slug },
      content_type: "json",
    }),
  });
}

async function main() {
  console.log(`Modo: ${CONFIRMAR ? "EXECUÇÃO (vai enfileirar de verdade)" : "DRY-RUN (só lista, não enfileira — use --confirmar pra aplicar)"}`);

  console.log(`\nListando corretores aprovados em ${DB} (--remote)...`);
  const slugs = listarSlugsDeCorretoresAprovados();
  console.log(`${slugs.length} corretor(es) aprovado(s) com minisite.`);

  console.log(`\nChecando existência de corretores/{slug}.json em R2 (${BUCKET})...`);
  const faltando = [];
  for (const slug of slugs) {
    const existe = jsonCorretorExisteNoR2(slug);
    console.log(`  ${existe ? "✓ existe" : "✗ FALTANDO"} — corretores/${slug}.json`);
    if (!existe) faltando.push(slug);
  }

  if (faltando.length === 0) {
    console.log("\n✅ Nenhum corretor aprovado sem corretores/{slug}.json. Nada a fazer.");
    return;
  }

  console.log(`\n${faltando.length} corretor(es) sem corretores/{slug}.json: ${faltando.join(", ")}`);

  if (!CONFIRMAR) {
    console.log("\nDry-run — nenhuma mensagem foi enfileirada. Rode de novo com --confirmar pra aplicar.");
    return;
  }

  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    erroFatal(
      "CLOUDFLARE_API_TOKEN e/ou CLOUDFLARE_ACCOUNT_ID não configurados — necessários pra publicar na fila (ver comentário no topo deste arquivo). Nada foi enfileirado.",
    );
  }

  console.log(`\nResolvendo ID da fila "${QUEUE_NOME}"...`);
  const queueId = await resolverIdDaFila(accountId, token);

  console.log(`\nEnfileirando geração para ${faltando.length} corretor(es)...`);
  for (const slug of faltando) {
    await enfileirarGeracao(accountId, token, queueId, slug);
    console.log(`  → enfileirado: ${slug}`);
  }

  console.log(
    "\n✅ Enfileirado. O consumer real (src/queue.ts, dentro do Worker) processa as mensagens em instantes — confira depois com o mesmo comando `wrangler r2 object get` acima.",
  );
}

main().catch((erro) => erroFatal(erro.stack ?? String(erro)));
