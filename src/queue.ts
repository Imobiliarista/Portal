// Consumer da Cloudflare Queue (Lote 6 + Lote 11)
// Uma mensagem por arquivo (seção 4.4), nunca uma por corretor inteiro

import { Env } from "./index";
import { processarGerarJsonCorretor } from "./jobs/gerar-json-corretor";
import { processarGerarJsonCidade } from "./jobs/gerar-json-cidade";
import { processarRevalidacaoCruzada } from "./jobs/revalidacao-cruzada";
import {
  processarGerarSitemapPortal,
  processarGerarSitemapCorretor,
} from "./jobs/gerar-sitemap";
import { processarGerarXMLGrupoOLX } from "./modulos/feed-grupo-olx/gerador";
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
    const msg = message.body;

    try {
      if (msg.tipo === "gerar-json-corretor") {
        await processarGerarJsonCorretor(msg as any, env);
        message.ack();
      } else if (msg.tipo === "gerar-json-cidade") {
        await processarGerarJsonCidade(msg as any, env);
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
      } else if (msg.tipo === "gerar-xml-grupo-olx") {
        await processarGerarXMLGrupoOLX(msg as any, env);
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
      // uma mensagem que nunca vai processar).
      message.retry();
    }
  }

  console.log("✓ Lote de fila processado");
}

export type { MensagemFila };
