// Job: Revalidação cruzada — coordena regeneração de corretor + cidade
// Seção 4.4.1.1: quando toggle "postar na rede" muda ou anúncio é deletado
//
// Também dispara a regeneração dos feeds de portais externos ativos do
// corretor (Grupo OLX + portais independentes, seção 4.11) — achado da
// reconstrução do feed OLX: antes desta correção, NENHUM ponto do código
// disparava essa geração (a função pronta pra isso,
// dispararGeracaoXMLGrupoOLX, nunca era chamada de lugar nenhum), então o
// XML nunca era atualizado depois da criação/edição/exclusão de um
// anúncio.
//
// Mesmo achado se repetiu com o sitemap (auditoria de 2026-08-20, ver
// Histórico de Decisões em project.md): jobs/gerar-sitemap.ts e o
// consumer da fila (queue.ts, tipos "gerar-sitemap-portal" e
// "gerar-sitemap-corretor") sempre existiram corretos, mas nenhum ponto
// do código jamais enviava essas mensagens — a seção 4.16 já previa
// gerar o sitemap "no mesmo processo em lote que já gera os
// JSONs/XMLs", isto é, aqui, junto com gerar-json-cidade/gerar-json-corretor.

import { Env } from "../index";
import { listarCotasPortalDoCorretor } from "../db/queries-cotas-portal";

interface MensagemRevalidacaoCruzada {
  tipo: "revalidacao-cruzada";
  anuncio_id: number;
  corretor_id: number;
  corretor_slug: string;
  cidade_id: number;
  cidade_slug: string;
}

export async function processarRevalidacaoCruzada(
  mensagem: MensagemRevalidacaoCruzada,
  env: Env,
): Promise<void> {
  const { anuncio_id, corretor_id, corretor_slug, cidade_id, cidade_slug } = mensagem;

  try {
    const mensagens: Record<string, unknown>[] = [
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
      {
        // Materializa anuncios/{id}.json em R2 — fecha o gap de D1 no
        // pageview público (bot-detect.ts passa a ler daqui em vez de
        // consultar D1 a cada requisição de bot/crawler). Ver
        // jobs/gerar-json-anuncio.ts.
        tipo: "gerar-json-anuncio",
        anuncio_id,
      },
      {
        // sitemap-cidades.xml + sitemap-anuncios-{n}.xml (seção 4.16) —
        // regenerado no mesmo lote que os JSONs, nunca por cron nem por
        // requisição.
        tipo: "gerar-sitemap-portal",
      },
      {
        // sitemap.xml do minisite (seção 4.16) — mesmo lote que
        // corretores/{slug}.json.
        tipo: "gerar-sitemap-corretor",
        corretor_id,
        corretor_slug,
        cidade_slug,
      },
    ];

    // Uma mensagem por portal externo com cota ativa — mesmo princípio
    // de "uma mensagem por arquivo a ser gerado" (seção 4.4) já seguido
    // acima. processarGerarFeedPortalIndependente regenera o feed inteiro
    // daquele corretor+portal a partir do estado atual do D1, não só o
    // anúncio que mudou.
    const cotasAtivas = await listarCotasPortalDoCorretor(env.DB, corretor_id);
    for (const cota of cotasAtivas.filter((c) => c.ativo)) {
      mensagens.push({
        tipo: "gerar-feed-portal-independente",
        corretor_slug,
        portal_slug: cota.portal_nome,
      });
    }

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
  corretor_id: number,
  corretor_slug: string,
  cidade_id: number,
  cidade_slug: string,
): Promise<void> {
  const mensagem = {
    tipo: "revalidacao-cruzada",
    anuncio_id,
    corretor_id,
    corretor_slug,
    cidade_id,
    cidade_slug,
  };

  await fila.send(mensagem);
  console.log(`→ Revalidação cruzada enfileirada para anúncio ${anuncio_id}`);
}

// Exportado: também usado por routes/painel-superadmin.ts (regeneração
// manual de cidade pelo Superadmin) pra computar o mesmo cidade_slug que
// esse fluxo de edição normal usaria — sem duplicar a regra de slug.
export function slugificarCidade(nome: string): string {
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
// IMPORTANTE: não engolir o erro aqui. Antes este catch só dava
// console.warn e retornava normalmente — a rota HTTP que chamou (criação,
// edição, toggle "postar na rede", exclusão, restauração de backup)
// respondia sucesso pro usuário mesmo quando a materialização em R2
// falhava. Quem chama precisa saber que a revalidação falhou pra decidir
// o que informar — ver routes/api-anuncios-crud.ts e
// routes/api-anuncios-backup.ts.
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
        corretor_id,
        minisite.slug,
        cidade_id,
        slugificarCidade(cidade.nome),
      );
    }
  } catch (erroFila) {
    console.error(`Falha ao enfileirar revalidação do anúncio ${anuncio_id}:`, erroFila);
    throw erroFila;
  }
}

export type { MensagemRevalidacaoCruzada };
