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

function slugificarCidade(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

// Resolve slug do minisite + slug da cidade e dispara a revalidação cruzada.
// Ponto único usado por toda mutação de anúncio que afeta o JSON público
// (criar, editar qualquer campo, excluir, alternar "postar na rede") —
// consolida o que antes era ~20 linhas duplicadas em cada handler de
// api-anuncios-crud.ts e api-anuncios-backup.ts.
export async function enfileirarRevalidacaoDoAnuncio(
  env: Env,
  anuncio_id: number,
  corretor_id: number,
  cidade_id: number,
): Promise<void> {
  try {
    const minisite = await env.DB
      .prepare("SELECT slug FROM minisites WHERE corretor_id = ? LIMIT 1")
      .bind(corretor_id)
      .first() as { slug: string } | undefined;
    const cidade = await env.DB
      .prepare("SELECT nome FROM cidades WHERE id = ? LIMIT 1")
      .bind(cidade_id)
      .first() as { nome: string } | undefined;

    if (minisite && cidade) {
      await dispararRevalidacaoCruzada(
        env.FILA_ALTERACOES,
        anuncio_id,
        minisite.slug,
        cidade_id,
        slugificarCidade(cidade.nome),
      );
    }
  } catch (erroFila) {
    console.warn("Aviso: falha ao enfileirar revalidação:", erroFila);
  }
}

export type { MensagemRevalidacaoCruzada };
