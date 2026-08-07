// Job: Gera /corretores/{slug}.json com todos os anúncios do corretor
// Seções 4.4.1 (JSON duplo) e 4.4.2 (foto de capa apenas)

import { Env } from "../index";
import { buscarCorrelorPorSlug } from "../db/queries-corretores";
import { listarAnunciosDoCorretor } from "../db/queries-anuncios";
import { escreverJSON } from "../lib/r2";
import { estaModuloAtivo } from "../db/queries-modulos";

interface MensagemGerarJsonCorretor {
  tipo: "gerar-json-corretor";
  corretor_slug: string;
}

interface AnuncioCorretorItem {
  id: number;
  titulo: string;
  preco?: number;
  foto_capa?: string;
  quartos?: number;
  banheiros?: number;
  area_util?: number;
  bairro?: string;
  slug: string;
  criado_em: string;
  video_youtube_id?: string;
  tour_360_url?: string;
}

export async function processarGerarJsonCorretor(
  mensagem: MensagemGerarJsonCorretor,
  env: Env,
): Promise<void> {
  const { corretor_slug } = mensagem;

  try {
    // Verifica se os módulos estão ativos
    const moduloVideoAtivo = await estaModuloAtivo(env.DB, "video-youtube");
    const moduloTour360Ativo = await estaModuloAtivo(env.DB, "tour-360");

    const resultado = await buscarCorrelorPorSlug(env.DB, corretor_slug);
    if (!resultado) {
      console.error(`Corretor com slug "${corretor_slug}" não encontrado`);
      return;
    }

    const corretor = resultado.corretor;
    const { anuncios } = await listarAnunciosDoCorretor(env.DB, corretor.id, 1, 999);

    const itens: AnuncioCorretorItem[] = anuncios
      .filter((a) => !a.vendido_removido)
      .map((a) => {
        const fotos: string[] = a.fotos_json ? JSON.parse(a.fotos_json) : [];
        const preco = a.preco_venda || a.preco_aluguel;

        const item: AnuncioCorretorItem = {
          id: a.id,
          titulo: a.titulo,
          preco,
          foto_capa: fotos.length > 0 ? fotos[0] : undefined,
          quartos: a.quartos,
          banheiros: a.banheiros,
          area_util: a.area_util,
          bairro: a.bairro,
          slug: a.slug,
          criado_em: a.criado_em,
        };

        if (moduloVideoAtivo && a.video_youtube_id) {
          item.video_youtube_id = a.video_youtube_id;
        }

        if (moduloTour360Ativo && a.tour_360_url) {
          item.tour_360_url = a.tour_360_url;
        }

        return item;
      });

    const caminho = `corretores/${corretor_slug}.json`;
    await escreverJSON(env.DADOS_CACHE, caminho, itens);

    console.log(
      `✓ JSON do corretor "${corretor_slug}" gerado com ${itens.length} anúncios`,
    );
  } catch (erro) {
    console.error(`Erro ao gerar JSON do corretor "${corretor_slug}":`, erro);
    throw erro;
  }
}

export { MensagemGerarJsonCorretor };
