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
    const msgBruta: unknown = message.body;

    try {
      // A DLQ é o tratador de último nível — precisa ser mais defensiva
      // que a fila principal, não menos: nenhuma falha aqui (formato
      // inesperado, erro ao serializar, erro dentro de enviarAlertaDlq)
      // pode escapar sem log nem impedir o ack() abaixo. Antes desta
      // correção não havia try/catch nenhum ao redor do processamento de
      // cada mensagem — um payload malformado (ex: corpo nulo, sem campo
      // "tipo") derrubava o loop inteiro, deixando a própria mensagem sem
      // ack (retentando dentro da DLQ, que não tem outra
      // dead_letter_queue configurada atrás dela) e as mensagens
      // seguintes do batch sem processar — exatamente o achado da
      // auditoria de 2026-08-20 ("morre em silêncio, sem log nem alerta").
      console.error("Mensagem original na DLQ:", JSON.stringify(msgBruta));

      if (
        !msgBruta ||
        typeof msgBruta !== "object" ||
        typeof (msgBruta as Record<string, unknown>).tipo !== "string"
      ) {
        console.error(
          `❌ Mensagem malformada na dead letter queue (corpo inválido ou sem campo "tipo" em string) — sem alerta por e-mail; conteúdo bruto já logado acima.`,
        );
      } else {
        await enviarAlertaDlq(msgBruta as MensagemFila, env);
      }
    } catch (erro) {
      // Não usa JSON.stringify aqui de propósito: se o body malformado
      // foi exatamente o que quebrou o JSON.stringify acima (ex:
      // referência circular), serializar de novo lançaria outra vez.
      // console.error aceita o valor bruto direto e não lança nessas
      // situações.
      console.error(
        "❌ Erro ao processar mensagem na dead letter queue — conteúdo bruto:",
        msgBruta,
        erro,
      );
    }

    // Ack sempre, mesmo em erro — reprocessar aqui está fora do escopo do
    // Lote 23; o objetivo é só log + alerta best-effort, nunca deixar a
    // mensagem sem ack (ela ficaria retentando indefinidamente dentro da
    // própria DLQ, que não tem outra dead_letter_queue configurada atrás
    // dela).
    message.ack();
  }
}
