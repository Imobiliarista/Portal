// Consumer da Cloudflare Queue (Lote 6 + Lote 11)
// Uma mensagem por arquivo (seção 4.4), nunca uma por corretor inteiro

import { Env } from "./index";
import { processarGerarJsonCorretor } from "./jobs/gerar-json-corretor";
import { processarGerarJsonCidade } from "./jobs/gerar-json-cidade";
import { processarGerarJsonAnuncio } from "./jobs/gerar-json-anuncio";
import { processarGerarStatusMinisite } from "./jobs/gerar-status-minisite";
import { processarRevalidacaoCruzada } from "./jobs/revalidacao-cruzada";
import {
  processarGerarSitemapPortal,
  processarGerarSitemapCorretor,
} from "./jobs/gerar-sitemap";
import { processarGerarFeedPortalIndependente } from "./modulos/feed-portais-independentes/gerador";

type MensagemFila = {
  tipo: string;
  [key: string]: unknown;
};

export async function processarFilaAlteracoes(
  mensagens: MessageBatch<MensagemFila>,
  env: Env,
): Promise<void> {
  console.log(
    `📨 Processando ${mensagens.messages.length} mensagens da fila...`,
  );

  for (const message of mensagens.messages) {
    const msgBruta: unknown = message.body;

    // Payload sem o formato mínimo esperado (corpo nulo/indefinido, não é
    // objeto, ou sem um campo "tipo" em string) nunca fica bem-formado
    // tentando de novo — descarta (ack) sem retry, só loga o conteúdo
    // bruto pra investigação. Corrige o crash da auditoria de 2026-08-20:
    // acessar msg.tipo sem validar o formato lançava TypeError não
    // capturado quando o body era null/undefined, e esse throw escapava
    // de novo dentro do próprio catch (que também lia msg.tipo pro log),
    // derrubando o processamento do resto do batch.
    if (
      !msgBruta ||
      typeof msgBruta !== "object" ||
      typeof (msgBruta as Record<string, unknown>).tipo !== "string"
    ) {
      console.error(
        `❌ Mensagem malformada na fila (corpo inválido ou sem campo "tipo" em string) — descartada sem retry. Conteúdo bruto:`,
        msgBruta,
      );
      message.ack();
      continue;
    }

    const msg = msgBruta as MensagemFila;

    try {
      if (msg.tipo === "gerar-json-corretor") {
        await processarGerarJsonCorretor(msg as any, env);
        message.ack();
      } else if (msg.tipo === "gerar-json-cidade") {
        await processarGerarJsonCidade(msg as any, env);
        message.ack();
      } else if (msg.tipo === "gerar-json-anuncio") {
        await processarGerarJsonAnuncio(msg as any, env);
        message.ack();
      } else if (msg.tipo === "gerar-status-minisite") {
        await processarGerarStatusMinisite(msg as any, env);
        message.ack();
      } else if (msg.tipo === "revalidacao-cruzada") {
        await processarRevalidacaoCruzada(msg as any, env);
        message.ack();
      } else if (msg.tipo === "gerar-sitemap-portal") {
        await processarGerarSitemapPortal(msg as any, env);
        message.ack();
      } else if (msg.tipo === "gerar-sitemap-corretor") {
        await processarGerarSitemapCorretor(msg as any, env);
        message.ack();
      } else if (msg.tipo === "gerar-feed-portal-independente") {
        await processarGerarFeedPortalIndependente(msg as any, env);
        message.ack();
      } else {
        console.warn(`Tipo de mensagem desconhecido: ${msg.tipo}`);
        message.ack();
      }
    } catch (erro) {
      console.error(
        `❌ Erro ao processar mensagem do tipo "${msg.tipo}":`,
        erro,
      );
      // Retry explícito até `max_retries` (wrangler.toml); esgotado o
      // limite, a Queue move a mensagem pra `dead_letter_queue` em vez de
      // retentar pra sempre (seção 4.9/4.10 — não consumir cota à toa com
      // uma mensagem que nunca vai processar). Só chega aqui com `msg` já
      // validado (tem "tipo" em string) — erro é de processamento
      // (D1/R2/fila etc), não de formato, então retry ainda faz sentido;
      // payload malformado é tratado antes, sem passar por aqui.
      message.retry();
    }
  }

  console.log("✓ Lote de fila processado");
}

export type { MensagemFila };
