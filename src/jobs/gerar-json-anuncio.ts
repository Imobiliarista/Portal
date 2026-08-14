// Job: Gera /anuncios/{id}.json — detalhe materializado do anúncio para
// leitura pública (dynamic rendering de bots, seção 4.6/4.11).
//
// Por que este arquivo existe: antes desta correção, o dynamic rendering
// para bots (src/middleware/bot-detect.ts, renderizarParaBot) consultava
// D1 diretamente a cada requisição de bot/crawler para um anúncio
// individual — violação da regra "zero D1 no pageview público" (Documento
// Técnico de Implantação Edge-First, seção 2 e critérios de aceite, seção
// 14). Este job fecha esse gap: o detalhe do anúncio passa a ser
// publicado em R2 no mesmo ponto em que corretor/cidade já são
// revalidados (revalidacao-cruzada.ts), e o bot-detect passa a ler R2
// em vez de D1.

import { Env } from "../index";
import { escreverJSON, deletarArquivo } from "../lib/r2";

interface MensagemGerarJsonAnuncio {
  tipo: "gerar-json-anuncio";
  anuncio_id: number;
}

interface AnuncioDetalheJSON {
  id: number;
  titulo: string;
  preco_venda?: number;
  preco_aluguel?: number;
  descricao?: string;
  fotos: string[];
  quartos?: number;
  banheiros?: number;
  area_util?: number;
  corretor_id: number;
  vendido_removido: boolean;
  last_updated: string;
}

export async function processarGerarJsonAnuncio(
  mensagem: MensagemGerarJsonAnuncio,
  env: Env,
): Promise<void> {
  const { anuncio_id } = mensagem;
  const caminho = `anuncios/${anuncio_id}.json`;

  try {
    const anuncio = await env.DB.prepare(
      `SELECT a.id, a.titulo, a.preco_venda, a.preco_aluguel, a.descricao,
              a.fotos_json, a.quartos, a.banheiros, a.area_util,
              a.vendido_removido, a.corretor_id
       FROM anuncios a
       WHERE a.id = ?`,
    )
      .bind(anuncio_id)
      .first();

    // Anúncio não existe mais (excluído): remove o artefato público em vez
    // de deixar um JSON órfão servindo dado obsoleto (mesmo princípio de
    // limpeza órfã já aplicado a mídia — ver project.md seção 4.8).
    if (!anuncio) {
      await deletarArquivo(env.DADOS_CACHE, caminho);
      console.log(`✓ anuncios/${anuncio_id}.json removido (anúncio inexistente)`);
      return;
    }

    const a = anuncio as any;
    let fotos: string[] = [];
    if (a.fotos_json) {
      try {
        fotos = JSON.parse(a.fotos_json);
      } catch {
        fotos = [];
      }
    }

    const detalhe: AnuncioDetalheJSON = {
      id: a.id,
      titulo: a.titulo,
      preco_venda: a.preco_venda ?? undefined,
      preco_aluguel: a.preco_aluguel ?? undefined,
      descricao: a.descricao ?? undefined,
      fotos,
      quartos: a.quartos ?? undefined,
      banheiros: a.banheiros ?? undefined,
      area_util: a.area_util ?? undefined,
      corretor_id: a.corretor_id,
      vendido_removido: !!a.vendido_removido,
      last_updated: new Date().toISOString(),
    };

    await escreverJSON(env.DADOS_CACHE, caminho, detalhe);
    console.log(`✓ anuncios/${anuncio_id}.json materializado`);
  } catch (erro) {
    console.error(`Erro ao gerar JSON do anúncio ${anuncio_id}:`, erro);
    throw erro;
  }
}

export type { MensagemGerarJsonAnuncio, AnuncioDetalheJSON };
