// Consumer da Cloudflare Queue (Lote 6)
// Uma mensagem por arquivo (seção 4.4), nunca uma por corretor inteiro

import { Env } from "./index";
import { processarGerarJsonCorretor } from "./jobs/gerar-json-corretor";
import { processarGerarJsonCidade } from "./jobs/gerar-json-cidade";
import { processarRevalidacaoCruzada } from "./jobs/revalidacao-cruzada";

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
      } else {
        console.warn(`Tipo de mensagem desconhecido: ${msg.tipo}`);
        message.ack();
      }
    } catch (erro) {
      console.error(
        `❌ Erro ao processar mensagem do tipo "${msg.tipo}":`,
        erro,
      );
    }
  }

  console.log("✓ Lote de fila processado");
}

export type { MensagemFila };
