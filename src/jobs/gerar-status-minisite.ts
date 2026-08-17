// Job: Gera /tenants/{slug}/status.json — existência + liberação do
// minisite, para leitura pública sem D1 (seção 2 e 14 do Documento
// Técnico de Implantação Edge-First).
//
// Por que este arquivo existe: routes/minisite.ts fazia DUAS consultas a
// D1 (buscarCorrelorPorSlug + estaMinisiteLiberado) a cada requisição de
// QUALQUER visitante de QUALQUER tenant — exatamente o padrão que a
// Route wildcard *.imobiliarista.net/* deveria evitar. Este job
// materializa o mesmo resultado em R2 nos dois pontos em que o status
// realmente muda (criação do pré-cadastro e aprovação do superadmin);
// routes/minisite.ts passa a ler R2, nunca D1.

import { Env } from "../index";
import { escreverJSON } from "../lib/r2";

interface MensagemGerarStatusMinisite {
  tipo: "gerar-status-minisite";
  slug: string;
}

interface StatusMinisiteJSON {
  existe: true;
  liberado: boolean;
  corretor_id: number;
  minisite_id: number;
  last_updated: string;
}

export async function processarGerarStatusMinisite(
  mensagem: MensagemGerarStatusMinisite,
  env: Env,
): Promise<void> {
  const { slug } = mensagem;
  const caminho = `tenants/${slug}/status.json`;

  try {
    const resultado = await env.DB.prepare(
      `SELECT m.id as minisite_id, m.corretor_id, m.offline
       FROM minisites m
       WHERE m.slug = ?
       LIMIT 1`,
    )
      .bind(slug)
      .first();

    if (!resultado) {
      // Slug não existe (mudou ou nunca existiu) — não deixa artefato
      // órfão; routes/minisite.ts trata ausência de arquivo como 404.
      console.warn(`gerar-status-minisite: slug "${slug}" não encontrado em D1`);
      return;
    }

    const r = resultado as any;
    const status: StatusMinisiteJSON = {
      existe: true,
      liberado: !r.offline,
      corretor_id: r.corretor_id,
      minisite_id: r.minisite_id,
      last_updated: new Date().toISOString(),
    };

    await escreverJSON(env.DADOS_CACHE, caminho, status);
    console.log(`✓ tenants/${slug}/status.json materializado (liberado=${status.liberado})`);
  } catch (erro) {
    console.error(`Erro ao gerar status do minisite "${slug}":`, erro);
    throw erro;
  }
}

// Helper de conveniência pra chamar dos pontos que alteram o status
// (cadastro e aprovação) sem duplicar o `.send()` em cada call site.
//
// IMPORTANTE: não engolir o erro aqui. Antes este catch só dava
// console.warn e retornava normalmente — a rota HTTP que chamou (aprovação,
// criação, edição, toggle, pré-cadastro) respondia sucesso pro Superadmin
// mesmo quando a materialização em R2 falhava, e o site inteiro podia
// ficar "Indisponível" sem ninguém perceber. Quem chama precisa saber que
// a materialização falhou pra decidir o que informar ao Superadmin — ver
// routes/painel-superadmin.ts e routes/api-auth-cadastro.ts.
export async function enfileirarStatusMinisite(
  env: Env,
  slug: string,
): Promise<void> {
  try {
    await env.FILA_ALTERACOES.send({ tipo: "gerar-status-minisite", slug });
  } catch (erroFila) {
    console.error(`Falha ao enfileirar status do minisite "${slug}":`, erroFila);
    throw erroFila;
  }
}

export type { MensagemGerarStatusMinisite, StatusMinisiteJSON };
