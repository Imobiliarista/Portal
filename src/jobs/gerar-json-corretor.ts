// Job: Gera /corretores/{slug}.json com todos os anúncios do corretor
// Seções 4.4.1 (JSON duplo) e 4.4.2 (foto de capa apenas)

import { Env } from "../index";
import { buscarCorrelorPorSlug } from "../db/queries-corretores";
import { listarAnunciosDoCorretor } from "../db/queries-anuncios";
import { escreverJSON } from "../lib/r2";
import { estaModuloAtivo } from "../db/queries-modulos";
import { sincronizarArtefatosPwaDoCorretor } from "../modulos/pwa/logica";
import {
  obterFeedPadraoRedeUrl,
  resolverUrlFeed,
  verificarElegibilidadePublicacoes,
} from "../modulos/publicacoes/logica";

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

    // Módulos client-side puros (sem rota HTTP própria, sem controle por
    // plano — só flag de rede, seção 4.2.1): calculadora de financiamento
    // e comparação de anúncios. Diferente de vídeo/tour 360 (que ligam/
    // desligam um campo por anúncio), aqui o widget inteiro liga/desliga,
    // então o flag vai num campo à parte (`modulosAtivos`) em vez de por
    // item. Checado na geração em lote, mesmo padrão de PWA/Publicações
    // (ver src/modulos/pwa/logica.ts) — não em tempo de requisição, pois
    // portal.ts/minisite.ts servem o shell da SPA via Workers Static
    // Assets e não devem processar nada por visita humana (seção 4.6).
    const moduloCalculadoraAtivo = await estaModuloAtivo(env.DB, "calculadora-financiamento");
    const moduloComparacaoAtivo = await estaModuloAtivo(env.DB, "comparacao-anuncios");

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

    // Elegibilidade do módulo Publicações (Lote 16, seção 4.19) — o JSON do
    // corretor é a única fonte que o navegador consulta pra saber qual feed
    // usar (fluxo 100% client-side, nunca via D1/R2/Worker na leitura do
    // feed em si). Só inclui a chave quando elegível: ausência = módulo
    // desativado/downgrade, item de menu some no client (4.19).
    const elegibilidadePublicacoes = await verificarElegibilidadePublicacoes(
      env.DB,
      `${corretor_slug}.imobiliarista.net`,
    );

    const corpoJson: {
      listings: AnuncioCorretorItem[];
      publicacoes?: { feedUrl: string };
      modulosAtivos: { calculadoraFinanceira: boolean; comparacaoAnuncios: boolean };
    } = {
      listings: itens,
      modulosAtivos: {
        calculadoraFinanceira: moduloCalculadoraAtivo,
        comparacaoAnuncios: moduloComparacaoAtivo,
      },
    };

    if (elegibilidadePublicacoes.elegivel) {
      corpoJson.publicacoes = {
        feedUrl: resolverUrlFeed(elegibilidadePublicacoes.config, obterFeedPadraoRedeUrl(env)),
      };
    }

    const caminho = `corretores/${corretor_slug}.json`;
    await escreverJSON(env.DADOS_CACHE, caminho, corpoJson);

    // Sincroniza manifest.json/service-worker.js do PWA com a elegibilidade
    // atual (flag de rede + permite_pwa do plano — seção 4.18)
    await sincronizarArtefatosPwaDoCorretor(env, corretor_slug);

    console.log(
      `✓ JSON do corretor "${corretor_slug}" gerado com ${itens.length} anúncios`,
    );
  } catch (erro) {
    console.error(`Erro ao gerar JSON do corretor "${corretor_slug}":`, erro);
    throw erro;
  }
}

// Helper de conveniência pra chamar dos pontos que precisam materializar
// corretores/{slug}.json sem duplicar o `.send()` em cada call site — mesmo
// padrão de jobs/gerar-status-minisite.ts::enfileirarStatusMinisite.
//
// Antes desta função, o único gatilho existente pra este job era mutação de
// anúncio (jobs/revalidacao-cruzada.ts, disparado por
// routes/api-anuncios-crud.ts / api-anuncios-backup.ts) — a aprovação do
// corretor em si nunca enfileirava a geração deste artefato. Um corretor
// aprovado sem nenhum anúncio ainda cadastrado ficava permanentemente sem
// corretores/{slug}.json (gap estrutural desde a introdução do job, não
// regressão — ver Histórico de Decisões em project.md). Corrigido chamando
// esta função também em routes/painel-superadmin.ts (aprovação de
// pré-cadastro e criação direta pelo Superadmin).
//
// IMPORTANTE: não engolir o erro aqui — mesmo princípio de
// enfileirarStatusMinisite/enfileirarRevalidacaoDoAnuncio. Quem chama
// precisa saber que a materialização falhou pra decidir o que informar.
export async function enfileirarGeracaoJsonCorretor(
  env: Env,
  corretor_slug: string,
): Promise<void> {
  try {
    await env.FILA_ALTERACOES.send({ tipo: "gerar-json-corretor", corretor_slug });
  } catch (erroFila) {
    console.error(`Falha ao enfileirar geração do JSON do corretor "${corretor_slug}":`, erroFila);
    throw erroFila;
  }
}

export type { MensagemGerarJsonCorretor };
