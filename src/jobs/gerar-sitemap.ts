// Job: Gera sitemap.xml em índice + arquivos paginados de anúncios (Lote 11)
// Seção 4.16: respeitando o limite do Google de 50.000 URLs/50 MB por arquivo
//
// Exclusão do módulo PWA (Lote 15, seção 4.18): este job só itera
// anúncios/cidades — as rotas utilitárias /apps, /apps/android,
// /apps/iphone nunca entram aqui e nunca devem ser adicionadas a um
// arquivo de sitemap; elas são marcadas noindex,follow diretamente no
// HTML (src/modulos/pwa/rota.ts), não pertencem ao conteúdo indexável.

import { Env } from "../index";
import { escreverJSON, deletarArquivo } from "../lib/r2";

interface MensagemGerarSitemap {
  tipo: "gerar-sitemap-portal";
}

interface MensagemGerarSitemapCorretor {
  tipo: "gerar-sitemap-corretor";
  corretor_id: number;
  corretor_slug: string;
  cidade_slug: string;
}

const URLS_POR_ARQUIVO = 50000;
const LIMITE_TAMANHO_MB = 50;

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function processarGerarSitemapPortal(
  _mensagem: MensagemGerarSitemap,
  env: Env,
): Promise<void> {
  try {
    // Buscar todas as cidades com anúncios na rede
    const cidades = await env.DB.prepare(
      `SELECT DISTINCT c.id, c.nome
       FROM cidades c
       INNER JOIN anuncios a ON a.cidade_id = c.id
       WHERE a.postar_na_rede = 1 AND a.vendido_removido = 0
       ORDER BY c.nome ASC`,
    ).all();

    // Gerar sitemap-cidades.xml
    let xmlCidades = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

    const cidades_json = cidades.results as any[];

    for (const cidade of cidades_json) {
      const cidadeSlug = await obterCidadeSlug(cidade.id, env);
      const agora = new Date().toISOString().split("T")[0];

      // URL principal da cidade
      xmlCidades += `  <url>
    <loc>https://imobiliarista.net/${cidadeSlug}</loc>
    <lastmod>${agora}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
`;

      // URLs de filtro (cidade/negocio/categoria)
      const tiposNegocio = await env.DB.prepare(
        `SELECT DISTINCT tn.id, tn.slug
         FROM tipos_negocio tn
         INNER JOIN anuncios a ON a.tipo_negocio_id = tn.id
         WHERE a.cidade_id = ? AND a.postar_na_rede = 1 AND a.vendido_removido = 0`,
      )
        .bind(cidade.id)
        .all();

      for (const tn of tiposNegocio.results as any[]) {
        const categorias = await env.DB.prepare(
          `SELECT DISTINCT ci.id, ci.slug
           FROM categorias_imovel ci
           INNER JOIN anuncios a ON a.categoria_imovel_id = ci.id
           WHERE a.cidade_id = ? AND a.tipo_negocio_id = ? AND a.postar_na_rede = 1 AND a.vendido_removido = 0`,
        )
          .bind(cidade.id, tn.id)
          .all();

        for (const cat of categorias.results as any[]) {
          xmlCidades += `  <url>
    <loc>https://imobiliarista.net/${cidadeSlug}/${tn.slug}/${cat.slug}</loc>
    <lastmod>${agora}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
`;
        }
      }
    }

    xmlCidades += `</urlset>`;

    // Escrever sitemap-cidades.xml
    await env.DADOS_CACHE.put("sitemap-cidades.xml", xmlCidades, {
      customMetadata: {
        "content-type": "application/xml",
        "cache-control": "public, max-age=86400",
      },
    });

    console.log(`✓ sitemap-cidades.xml gerado`);

    // Gerar sitemap-anuncios-{n}.xml paginado
    const totalAnuncios = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM anuncios WHERE postar_na_rede = 1 AND vendido_removido = 0`,
    ).first();

    const total = (totalAnuncios as any)?.total || 0;
    const numPaginas = Math.ceil(total / URLS_POR_ARQUIVO);

    // Limpar arquivos antigos
    for (let i = 1; i <= 100; i++) {
      try {
        await deletarArquivo(env.DADOS_CACHE, `sitemap-anuncios-${i}.xml`);
      } catch {
        break;
      }
    }

    // Gerar novos arquivos paginados
    for (let pagina = 1; pagina <= numPaginas; pagina++) {
      const offset = (pagina - 1) * URLS_POR_ARQUIVO;

      const anuncios = await env.DB.prepare(
        `SELECT a.id, a.slug, a.atualizado_em, c.nome as cidade_nome,
                tn.slug as tipo_negocio, ci.slug as categoria, ti.slug as tipo_imovel
         FROM anuncios a
         JOIN cidades c ON a.cidade_id = c.id
         JOIN tipos_negocio tn ON a.tipo_negocio_id = tn.id
         JOIN categorias_imovel ci ON a.categoria_imovel_id = ci.id
         JOIN tipos_imovel ti ON a.tipo_imovel_id = ti.id
         WHERE a.postar_na_rede = 1 AND a.vendido_removido = 0
         ORDER BY a.id ASC
         LIMIT ? OFFSET ?`,
      )
        .bind(URLS_POR_ARQUIVO, offset)
        .all();

      const anuncios_json = anuncios.results as any[];

      let xmlAnuncios = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

      for (const anuncio of anuncios_json) {
        const cidadeSlug = await obterCidadeSlug(anuncio.cidade_id, env);
        const dataAtualizado = new Date(anuncio.atualizado_em)
          .toISOString()
          .split("T")[0];

        xmlAnuncios += `  <url>
    <loc>https://imobiliarista.net/${cidadeSlug}/${anuncio.tipo_negocio}/${anuncio.categoria}/${anuncio.tipo_imovel}/${escaparXml(anuncio.slug)}-${anuncio.id}</loc>
    <lastmod>${dataAtualizado}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
`;
      }

      xmlAnuncios += `</urlset>`;

      await env.DADOS_CACHE.put(
        `sitemap-anuncios-${pagina}.xml`,
        xmlAnuncios,
        {
          customMetadata: {
            "content-type": "application/xml",
            "cache-control": "public, max-age=86400",
          },
        },
      );

      console.log(
        `✓ sitemap-anuncios-${pagina}.xml gerado (${anuncios_json.length} URLs)`,
      );
    }

    console.log(`✓ Sitemap do Portal gerado (${numPaginas} arquivos de anúncios)`);
  } catch (erro) {
    console.error(`Erro ao gerar sitemap do portal:`, erro);
    throw erro;
  }
}

export async function processarGerarSitemapCorretor(
  mensagem: MensagemGerarSitemapCorretor,
  env: Env,
): Promise<void> {
  const { corretor_id, corretor_slug } = mensagem;

  try {
    // Buscar anúncios do corretor
    const anuncios = await env.DB.prepare(
      `SELECT a.id, a.slug, a.atualizado_em, c.nome as cidade_nome,
              c.id as cidade_id, tn.slug as tipo_negocio,
              ci.slug as categoria, ti.slug as tipo_imovel
       FROM anuncios a
       JOIN cidades c ON a.cidade_id = c.id
       JOIN tipos_negocio tn ON a.tipo_negocio_id = tn.id
       JOIN categorias_imovel ci ON a.categoria_imovel_id = ci.id
       JOIN tipos_imovel ti ON a.tipo_imovel_id = ti.id
       WHERE a.corretor_id = ? AND a.vendido_removido = 0
       ORDER BY a.criado_em DESC`,
    )
      .bind(corretor_id)
      .all();

    const anuncios_json = anuncios.results as any[];

    if (!anuncios_json || anuncios_json.length === 0) {
      // Gerar sitemap vazio
      const xmlVazio = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://${corretor_slug}.imobiliarista.net/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;

      await env.DADOS_CACHE.put(
        `sitemaps/minisite-${corretor_slug}.xml`,
        xmlVazio,
        {
          customMetadata: {
            "content-type": "application/xml",
            "cache-control": "public, max-age=86400",
          },
        },
      );

      console.log(`✓ Sitemap do minisite "${corretor_slug}" gerado (vazio)`);
      return;
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://${corretor_slug}.imobiliarista.net/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
`;

    for (const anuncio of anuncios_json) {
      const cidadeSlug = await obterCidadeSlug(anuncio.cidade_id, env);
      const dataAtualizado = new Date(anuncio.atualizado_em)
        .toISOString()
        .split("T")[0];

      xml += `  <url>
    <loc>https://${corretor_slug}.imobiliarista.net/${cidadeSlug}/${anuncio.tipo_negocio}/${anuncio.categoria}/${anuncio.tipo_imovel}/${escaparXml(anuncio.slug)}-${anuncio.id}</loc>
    <lastmod>${dataAtualizado}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
    }

    xml += `</urlset>`;

    await env.DADOS_CACHE.put(`sitemaps/minisite-${corretor_slug}.xml`, xml, {
      customMetadata: {
        "content-type": "application/xml",
        "cache-control": "public, max-age=86400",
      },
    });

    console.log(
      `✓ Sitemap do minisite "${corretor_slug}" gerado (${anuncios_json.length} anúncios)`,
    );
  } catch (erro) {
    console.error(
      `Erro ao gerar sitemap do corretor ${corretor_id}:`,
      erro,
    );
    throw erro;
  }
}

async function obterCidadeSlug(cidade_id: number, env: Env): Promise<string> {
  const cidade = await env.DB.prepare(
    `SELECT nome FROM cidades WHERE id = ?`,
  )
    .bind(cidade_id)
    .first();

  if (!cidade) {
    return "indefinida";
  }

  const cidadNome = (cidade as any).nome;
  return cidadNome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
}

export type {
  MensagemGerarSitemap,
  MensagemGerarSitemapCorretor,
};
