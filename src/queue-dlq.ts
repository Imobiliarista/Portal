// Consumer da dead letter queue (imob-queue-dlq) — Lote 23
// Mensagens que esgotam `max_retries` da imob-queue (wrangler.toml) caem
// aqui. Escopo fechado de propósito: só log completo + alerta por e-mail
// pra visibilidade operacional, sem reprocessamento automático nem retry
// manual da DLQ. Ver project.md, seção 4.9/4.10.

import { Env } from "./index";
import { MensagemFila } from "./queue";

async function enviarAlertaDlq(mensagem: MensagemFila, env: Env): Promise<void> {
  const destinatario = env.EMAIL_ALERTA_OPERACIONAL;
  if (!destinatario) {
    console.error("EMAIL_ALERTA_OPERACIONAL não configurada — alerta de DLQ não enviado");
    return;
  }

  // Mesmo padrão de acesso ao Resend usado em api-auth-recuperacao.ts /
  // busca-salva-email/logica.ts — nodejs_compat expõe secrets via
  // process.env, sem precisar tipar RESEND_API_KEY em Env.
  const resendApiKey = (globalThis as any).RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error("RESEND_API_KEY não configurada — alerta de DLQ não enviado");
    return;
  }

  const timestamp = new Date().toISOString();
  const corretorOuCidade =
    (mensagem as Record<string, unknown>).corretor_slug ||
    (mensagem as Record<string, unknown>).cidade ||
    "-";

  const corpo = [
    `Mensagem caiu na dead letter queue (imob-queue-dlq) após esgotar as retentativas da imob-queue.`,
    ``,
    `Tipo: ${mensagem.tipo}`,
    `corretor_slug/cidade: ${corretorOuCidade}`,
    `Timestamp: ${timestamp}`,
    ``,
    `Payload completo:`,
    JSON.stringify(mensagem, null, 2),
    ``,
    `Sem reprocessamento automático (fora do escopo deste alerta) — verifique o payload no Cloudflare Logs e reenfileire manualmente se necessário.`,
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "alertas@imobiliarista.net",
        to: destinatario,
        subject: `[Alerta] Mensagem na dead letter queue — tipo "${mensagem.tipo}"`,
        text: corpo,
      }),
    });

    if (!response.ok) {
      console.error(`Erro ao enviar alerta de DLQ: ${response.status} ${response.statusText}`);
    }
  } catch (erro) {
    // Falha secundária (envio do e-mail) não pode derrubar o
    // processamento da mensagem da fila — mesmo princípio de
    // tentarRevalidarAnuncio em api-anuncios-crud.ts (comentário sobre
    // FILA_ALTERACOES). O console.error da mensagem original, feito
    // antes desta chamada, já cobre a visibilidade mínima.
    console.error("Erro ao enviar alerta de DLQ:", erro);
  }
}

export async function processarFilaMorta(
  mensagens: MessageBatch<MensagemFila>,
  env: Env,
): Promise<void> {
  console.error(
    `⚠️ ${mensagens.messages.length} mensagem(ns) na dead letter queue (imob-queue-dlq)`,
  );

  for (const message of mensagens.messages) {
    const msg = message.body;

    console.error("Mensagem original na DLQ:", JSON.stringify(msg));

    await enviarAlertaDlq(msg, env);

    // Ack depois de logar e tentar alertar — sem isso a mensagem
    // ficaria retentando indefinidamente dentro da própria DLQ (que não
    // tem outra dead_letter_queue configurada atrás dela). Reprocessar o
    // payload original ou reenfileirar na imob-queue está fora do
    // escopo desta tarefa (Lote 23).
    message.ack();
  }
}
