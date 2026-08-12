// Job: Revalidação cruzada — coordena regeneração de corretor + cidade
// Seção 4.4.1.1: quando toggle "postar na rede" muda ou anúncio é deletado

import { Env } from "../index";

interface MensagemRevalidacaoCruzada {
  tipo: "revalidacao-cruzada";
  anuncio_id: number;
  corretor_slug: string;
  cidade_id: number;
  cidade_slug: string;
}

export async function processarRevalidacaoCruzada(
  mensagem: MensagemRevalidacaoCruzada,
  env: Env,
): Promise<void> {
  const { anuncio_id, corretor_slug, cidade_id, cidade_slug } = mensagem;

  try {
    const mensagens = [
      {
        tipo: "gerar-json-corretor",
        corretor_slug,
      },
      {
        // cidade_id é necessário pra consulta em jobs/gerar-json-cidade.ts
        // (WHERE a.cidade_id = ?); cidade_slug é necessário pro caminho do
        // arquivo no R2 — os dois precisam viajar juntos na mensagem.
        tipo: "gerar-json-cidade",
        cidade_id,
        cidade_slug,
      },
    ];

    for (const msg of mensagens) {
      await env.FILA_ALTERACOES.send(msg);
    }

    console.log(
      `✓ Revalidação cruzada enfileirada para anúncio ${anuncio_id}`,
    );
  } catch (erro) {
    console.error(`Erro ao processar revalidação cruzada:`, erro);
    throw erro;
  }
}

export async function dispararRevalidacaoCruzada(
  fila: Queue,
  anuncio_id: number,
  corretor_slug: string,
  cidade_id: number,
  cidade_slug: string,
): Promise<void> {
  const mensagem = {
    tipo: "revalidacao-cruzada",
    anuncio_id,
    corretor_slug,
    cidade_id,
    cidade_slug,
  };

  await fila.send(mensagem);
  console.log(`→ Revalidação cruzada enfileirada para anúncio ${anuncio_id}`);
}

export type { MensagemRevalidacaoCruzada };
