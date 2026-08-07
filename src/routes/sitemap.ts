// Rota de sitemap.xml e robots.txt (Lote 11)
// Seções 4.16 (sitemap.xml e robots.txt dinâmicos por hostname), 4.17 (HTTP 410 para bots)

import { Env } from "../index";
import { lerJSON } from "../lib/r2";

interface IndiceCidade {
  last_updated: string;
  total_anuncios: number;
  particoes?: {
    nivel: string;
    arquivos: string[];
  };
}

function ehDominioRaiz(hostname: string): boolean {
  return hostname === "imobiliarista.net";
}

function ehSubdominio(hostname: string): boolean {
  return (
    hostname.endsWith(".imobiliarista.net") &&
    hostname !== "imobiliarista.net"
  );
}

function extrairSlugCorretor(hostname: string): string | null {
  if (!ehSubdominio(hostname)) {
    return null;
  }
  const slug = hostname.split(".")[0];
  return slug;
}

function gerarRobotsTxt(hostname: string, siteUrl: string): string {
  const disallow = ["/painel/", "/api/"];
  const disallowLines = disallow.map((d) => `Disallow: ${d}`).join("\n");

  const linhasSitemap =
    hostname === "imobiliarista.net"
      ? `Sitemap: ${siteUrl}/sitemap-index.xml`
      : `Sitemap: ${siteUrl}/sitemap.xml`;

  return `User-agent: *
${disallowLines}
Allow: /

${linhasSitemap}
`;
}

async function gerarSitemapPortal(
  env: Env,
  siteUrl: string,
): Promise<string> {
  const xmlns = "http://www.sitemaps.org/schemas/sitemap/0.9";

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="${xmlns}">
  <sitemap>
    <loc>${siteUrl}/sitemap-cidades.xml</loc>
  </sitemap>`;

  // Adicionar referências aos arquivos paginados de anúncios
  for (let i = 1; i <= 100; i++) {
    const caminhoArquivo = `sitemap-anuncios-${i}.xml`;
    try {
      const existeArquivo = await env.DADOS_CACHE.head(caminhoArquivo);
      if (existeArquivo) {
        xml += `
  <sitemap>
    <loc>${siteUrl}/${caminhoArquivo}</loc>
  </sitemap>`;
      }
    } catch {
      break;
    }
  }

  xml += `
</sitemapindex>`;

  return xml;
}

async function gerarSitemapMinиsite(
  env: Env,
  slugCorretor: string,
  siteUrl: string,
): Promise<string> {
  const xmlns = "http://www.sitemaps.org/schemas/sitemap/0.9";
  const caminhoArquivo = `sitemaps/minisite-${slugCorretor}.xml`;

  try {
    const conteudo = await env.DADOS_CACHE.get(caminhoArquivo);
    if (conteudo) {
      return await conteudo.text();
    }
  } catch {
    // Arquivo não existe, gerar vazio
  }

  // Se não existir arquivo gerado, retornar sitemap vazio
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="${xmlns}">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
}

export async function rotasSitemap(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const hostname = url.hostname;
  const siteUrl = `${url.protocol}//${hostname}`;

  // robots.txt
  if (url.pathname === "/robots.txt") {
    const conteudo = gerarRobotsTxt(hostname, siteUrl);
    return new Response(conteudo, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=86400",
      },
    });
  }

  // sitemap.xml do Portal Principal
  if (ehDominioRaiz(hostname) && url.pathname === "/sitemap-index.xml") {
    const conteudo = await gerarSitemapPortal(env, siteUrl);
    return new Response(conteudo, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=86400",
      },
    });
  }

  // sitemap.xml de cada Minisite
  if (ehSubdominio(hostname) && url.pathname === "/sitemap.xml") {
    const slugCorretor = extrairSlugCorretor(hostname);
    if (!slugCorretor) {
      return new Response("Not Found", { status: 404 });
    }

    const conteudo = await gerarSitemapMinиsite(env, slugCorretor, siteUrl);
    return new Response(conteudo, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=86400",
      },
    });
  }

  // sitemap-cidades.xml e sitemap-anuncios-{n}.xml servidos do R2
  if (
    ehDominioRaiz(hostname) &&
    (url.pathname === "/sitemap-cidades.xml" ||
      url.pathname.match(/^\/sitemap-anuncios-\d+\.xml$/))
  ) {
    const nomearquivo = url.pathname.substring(1);
    try {
      const objeto = await env.DADOS_CACHE.get(nomearquivo);
      if (objeto) {
        const conteudo = await objeto.text();
        return new Response(conteudo, {
          status: 200,
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=86400",
          },
        });
      }
    } catch {
      // Arquivo não existe
    }
    return new Response("Not Found", { status: 404 });
  }

  return new Response("Not Found", { status: 404 });
}
