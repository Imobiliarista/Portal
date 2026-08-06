// Roteamento do domínio raiz (imobiliarista.net)
// Lote 4: reconhece padrões de URL, retorna placeholders
// Lote 11: dynamic rendering para bots em anúncios individuais

import { Env } from "../index";
import { ehBot, renderizarParaBot } from "../middleware/bot-detect";

interface ParamsMapeados {
  tipo: "home" | "cidade" | "negocio-categoria-tipo" | "anuncio";
  cidade?: string;
  tipoNegocio?: string;
  categoria?: string;
  tipoImovel?: string;
  slug?: string;
  id?: string;
}

function extrairParametrosURL(caminho: string): ParamsMapeados {
  const segmentos = caminho.split("/").filter((s) => s); // Remove strings vazias

  // Nenhum segmento = Home
  if (segmentos.length === 0) {
    return { tipo: "home" };
  }

  // 1 segmento: /{cidade}
  if (segmentos.length === 1) {
    return { tipo: "cidade", cidade: segmentos[0] };
  }

  // 2 segmentos: /{cidade}/{tipo-negocio}
  if (segmentos.length === 2) {
    return {
      tipo: "negocio-categoria-tipo",
      cidade: segmentos[0],
      tipoNegocio: segmentos[1],
    };
  }

  // 3 segmentos: /{cidade}/{tipo-negocio}/{categoria} ou {cidade}/{negocio}/{slug-id}
  if (segmentos.length === 3) {
    // Checar se o terceiro segmento parece um slug-id (contém hífen)
    const terceiro = segmentos[2];
    if (terceiro.includes("-")) {
      // Provável anúncio individual: /{cidade}/{tipo-negocio}/{slug-id}
      // Mas isto não está no padrão correto (falta tipo-imovel)
      // Por enquanto, tratar como "negocio-categoria-tipo" genérico
      return {
        tipo: "negocio-categoria-tipo",
        cidade: segmentos[0],
        tipoNegocio: segmentos[1],
        categoria: segmentos[2],
      };
    }
    return {
      tipo: "negocio-categoria-tipo",
      cidade: segmentos[0],
      tipoNegocio: segmentos[1],
      categoria: segmentos[2],
    };
  }

  // 4 segmentos: /{cidade}/{tipo-negocio}/{categoria}/{tipo-imovel}
  if (segmentos.length === 4) {
    const quarto = segmentos[3];
    if (quarto.includes("-")) {
      // Parece anúncio individual: /{cidade}/{tipo-negocio}/{categoria}/{slug-id}
      // Extrair id do fim após último hífen
      const ultimoHifen = quarto.lastIndexOf("-");
      const slug = quarto.substring(0, ultimoHifen);
      const id = quarto.substring(ultimoHifen + 1);
      return {
        tipo: "anuncio",
        cidade: segmentos[0],
        tipoNegocio: segmentos[1],
        categoria: segmentos[2],
        tipoImovel: "", // Inferir do slug/id se necessário
        slug,
        id,
      };
    }
    return {
      tipo: "negocio-categoria-tipo",
      cidade: segmentos[0],
      tipoNegocio: segmentos[1],
      categoria: segmentos[2],
      tipoImovel: segmentos[3],
    };
  }

  // 5 segmentos: /{cidade}/{tipo-negocio}/{tipo-imovel}/{slug-id}
  // Padrão: /{cidade}/{tipo-negocio}/{categoria}/{tipo-imovel}/{slug-id}
  if (segmentos.length === 5) {
    const quinto = segmentos[4];
    if (quinto.includes("-")) {
      const ultimoHifen = quinto.lastIndexOf("-");
      const slug = quinto.substring(0, ultimoHifen);
      const id = quinto.substring(ultimoHifen + 1);
      return {
        tipo: "anuncio",
        cidade: segmentos[0],
        tipoNegocio: segmentos[1],
        categoria: segmentos[2],
        tipoImovel: segmentos[3],
        slug,
        id,
      };
    }
  }

  // Padrão não reconhecido
  return { tipo: "home" };
}

function respostaPlaceholder(params: ParamsMapeados): Response {
  const conteudo = (() => {
    switch (params.tipo) {
      case "home":
        return "Portal Imobiliarista — Home";

      case "cidade":
        return `Portal — Cidade: ${params.cidade}\n\nFiltros disponíveis (JSON do R2 a ser carregado no Lote 6-7)`;

      case "negocio-categoria-tipo":
        return `Portal — Filtro de Negócio/Categoria/Tipo\nCidade: ${params.cidade}\nTipo de Negócio: ${params.tipoNegocio}\nCategoria: ${params.categoria || "(geral)"}\nTipo de Imóvel: ${params.tipoImovel || "(geral)"}`;

      case "anuncio":
        return `Anúncio Individual\nCidade: ${params.cidade}\nTipo de Negócio: ${params.tipoNegocio}\nSlug: ${params.slug}\nID: ${params.id}\n\nDados do anúncio (JSON detalhado do R2 a ser carregado no Lote 6-7)`;

      default:
        return "Portal Imobiliarista";
    }
  })();

  return new Response(`Portal Imobiliarista\n\n${conteudo}\n\n[Lote 4 — Roteamento reconhecido]`, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function rotasPortal(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const parametros = extrairParametrosURL(url.pathname);

  // Lote 11: Dynamic rendering para bots (seção 4.6)
  if (ehBot(request) && parametros.tipo === "anuncio" && parametros.id) {
    const anuncioId = parseInt(parametros.id, 10);
    if (!isNaN(anuncioId)) {
      const respostaBotRendering = await renderizarParaBot(anuncioId, env);
      if (respostaBotRendering) {
        return respostaBotRendering;
      }
    }
  }

  return respostaPlaceholder(parametros);
}
