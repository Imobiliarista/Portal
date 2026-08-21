// Job: Gera /cidades/{cidade}.json com particionamento automático
// Seções 4.4.1 (JSON da cidade), 4.4.2 (particionamento por tamanho), 4.6.1 (índice com last_updated)

import { Env } from "../index";
import { escreverJSON, estimarTamanhoComprimido } from "../lib/r2";
import { estaModuloAtivo } from "../db/queries-modulos";

interface MensagemGerarJsonCidade {
  tipo: "gerar-json-cidade";
  cidade_id: number;
  cidade_slug: string;
}

interface AnuncioCidadeItem {
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
  latitude?: number;
  longitude?: number;
}

interface IndiceCidade {
  last_updated: string;
  total_anuncios: number;
  particoes?: {
    nivel: string;
    arquivos: string[];
  };
  modulosAtivos: { calculadoraFinanceira: boolean; comparacaoAnuncios: boolean };
}

const LIMITE_TAMANHO_COMPRIMIDO = 1024 * 1024;

export async function processarGerarJsonCidade(
  mensagem: MensagemGerarJsonCidade,
  env: Env,
): Promise<void> {
  const { cidade_id, cidade_slug } = mensagem;

  try {
    // Verifica se os módulos estão ativos
    const moduloVideoAtivo = await estaModuloAtivo(env.DB, "video-youtube");
    const moduloTour360Ativo = await estaModuloAtivo(env.DB, "tour-360");

    // Módulos client-side puros (calculadora de financiamento, comparação
    // de anúncios — seção 2.1): só flag de rede, nunca por plano do
    // corretor. Igual ao mesmo campo em jobs/gerar-json-corretor.ts, mas
    // aqui só pode ser a flag de REDE — o JSON de cidade é agregado entre
    // vários corretores (4.4.1), então não existe "plano do corretor"
    // único pra aplicar dentro dele.
    const moduloCalculadoraAtivo = await estaModuloAtivo(env.DB, "calculadora-financiamento");
    const moduloComparacaoAtivo = await estaModuloAtivo(env.DB, "comparacao-anuncios");
    const modulosAtivos = {
      calculadoraFinanceira: moduloCalculadoraAtivo,
      comparacaoAnuncios: moduloComparacaoAtivo,
    };

    let sqlSelect = `SELECT a.id, a.titulo, a.preco_venda, a.preco_aluguel,
                a.quartos, a.banheiros, a.area_util, a.bairro,
                a.fotos_json, a.slug, a.criado_em, a.latitude, a.longitude`;

    if (moduloVideoAtivo) sqlSelect += ", a.video_youtube_id";
    if (moduloTour360Ativo) sqlSelect += ", a.tour_360_url";

    const anuncios = await env.DB
      .prepare(
        `${sqlSelect}
         FROM anuncios a
         WHERE a.cidade_id = ? AND a.postar_na_rede = 1 AND a.vendido_removido = 0
         ORDER BY a.criado_em DESC`,
      )
      .bind(cidade_id)
      .all();

    if (!anuncios.results || anuncios.results.length === 0) {
      await escreverJSON(env.DADOS_CACHE, `cidades/${cidade_slug}/_index.json`, {
        last_updated: new Date().toISOString(),
        total_anuncios: 0,
        modulosAtivos,
      } as IndiceCidade);
      return;
    }

    const items: AnuncioCidadeItem[] = (anuncios.results || []).map((a: any) => {
      const fotos: string[] = a.fotos_json ? JSON.parse(a.fotos_json) : [];
      const preco = a.preco_venda || a.preco_aluguel;

      const item: AnuncioCidadeItem = {
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
        latitude: a.latitude ?? undefined,
        longitude: a.longitude ?? undefined,
      };

      if (moduloVideoAtivo && a.video_youtube_id) {
        item.video_youtube_id = a.video_youtube_id;
      }

      if (moduloTour360Ativo && a.tour_360_url) {
        item.tour_360_url = a.tour_360_url;
      }

      return item;
    });

    const tamanhoEstimado = await estimarTamanhoComprimido(items);

    if (tamanhoEstimado <= LIMITE_TAMANHO_COMPRIMIDO) {
      await escreverJSON(env.DADOS_CACHE, `cidades/${cidade_slug}.json`, items);
      await escreverJSON(env.DADOS_CACHE, `cidades/${cidade_slug}/_index.json`, {
        last_updated: new Date().toISOString(),
        total_anuncios: items.length,
        modulosAtivos,
      } as IndiceCidade);

      console.log(
        `✓ JSON da cidade "${cidade_slug}" gerado (${items.length} anúncios, ~${Math.round(tamanhoEstimado / 1024)} KB comprimidos)`,
      );
      return;
    }

    console.log(
      `Tamanho estimado ${Math.round(tamanhoEstimado / 1024)} KB ultrapassa limite; particionando...`,
    );

    const arquivos: string[] = [];

    // Agrupar por bairro como estratégia de partição simples para fase 1
    const porBairro = new Map<string, AnuncioCidadeItem[]>();
    for (const item of items) {
      const bairro = item.bairro || "indefinido";
      if (!porBairro.has(bairro)) {
        porBairro.set(bairro, []);
      }
      porBairro.get(bairro)!.push(item);
    }

    for (const [bairro, itensBairro] of porBairro.entries()) {
      const bairroSlug = slugificar(bairro);
      const tamanho = await estimarTamanhoComprimido(itensBairro);

      if (tamanho <= LIMITE_TAMANHO_COMPRIMIDO) {
        const caminho = `cidades/${cidade_slug}/${bairroSlug}.json`;
        await escreverJSON(env.DADOS_CACHE, caminho, itensBairro);
        arquivos.push(caminho);
      } else {
        // Paginação como última estratégia
        const tamanhoPagina = 50;
        for (let i = 0; i < itensBairro.length; i += tamanhoPagina) {
          const pagina = Math.floor(i / tamanhoPagina) + 1;
          const paginaItens = itensBairro.slice(i, i + tamanhoPagina);
          const caminho = `cidades/${cidade_slug}/${bairroSlug}-p${pagina}.json`;
          await escreverJSON(env.DADOS_CACHE, caminho, paginaItens);
          arquivos.push(caminho);
        }
      }
    }

    await escreverJSON(env.DADOS_CACHE, `cidades/${cidade_slug}/_index.json`, {
      last_updated: new Date().toISOString(),
      total_anuncios: items.length,
      particoes: {
        nivel: "bairro",
        arquivos,
      },
      modulosAtivos,
    } as IndiceCidade);

    console.log(
      `✓ JSON da cidade "${cidade_slug}" particionado em ${arquivos.length} arquivos`,
    );
  } catch (erro) {
    console.error(`Erro ao gerar JSON da cidade ${cidade_id}:`, erro);
    throw erro;
  }
}

function slugificar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export type { MensagemGerarJsonCidade, IndiceCidade };
