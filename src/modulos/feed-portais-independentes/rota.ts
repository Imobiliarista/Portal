// Rota: GET /feeds/{portal-slug}/{slug-corretor}.{ext} — Serve arquivos de portais independentes
// Seção 4.11 do project.md
//
// Checagem dupla (flag de rede + cota ativa) em tempo de requisição, não
// só na geração do feed (processarGerarFeedPortalIndependente): sem isso,
// desativar o módulo ou a cota do corretor não tinha efeito nenhum sobre o
// arquivo já gravado no R2, que continuava sendo servido publicamente.
// Decisão de limpeza (ver Histórico de Decisões do project.md, seção 11):
// não deletamos o objeto do R2 no ato da desativação — o arquivo antigo
// fica esquecido no bucket, mas a rota passa a responder 404 sempre que o
// módulo/cota não estiver ativo, então ele nunca mais é servido.

import { Env } from "../../index";
import { estaModuloAtivo } from "../../db/queries-modulos";
import { buscarCorrelorPorSlug } from "../../db/queries-corretores";
import { buscarCotaPortal } from "../../db/queries-cotas-portal";

// Rota: GET /feeds/{portal}/{slug}.{ext}
export async function rotaFeedPortalIndependente(
  request: Request,
  url: URL,
  env: Env
): Promise<Response> {
  // Extrai portal e slug da URL: /feeds/imovelweb/marcos.xml
  const pathname = url.pathname;
  const parts = pathname.split("/").filter(Boolean); // Remove strings vazias

  if (parts.length < 3) {
    return new Response("Caminho inválido", { status: 400 });
  }

  // parts[0] = 'feeds', parts[1] = portal_slug, parts[2] = arquivo.ext
  const portalSlug = parts[1];
  const arquivo = parts[2];

  if (!portalSlug || !arquivo) {
    return new Response("Portal ou arquivo não fornecido", { status: 400 });
  }

  try {
    const moduloAtivo = await estaModuloAtivo(env.DB, "feed-portais-independentes");
    if (!moduloAtivo) {
      return new Response("Feed não encontrado", { status: 404 });
    }

    const corretorSlug = arquivo.replace(/\.[^.]+$/, "");
    const resultado = await buscarCorrelorPorSlug(env.DB, corretorSlug);
    if (!resultado) {
      return new Response("Feed não encontrado", { status: 404 });
    }

    const cota = await buscarCotaPortal(env.DB, resultado.corretor.id, portalSlug);
    if (!cota || !cota.ativo) {
      return new Response("Feed não encontrado", { status: 404 });
    }

    // Busca o arquivo no R2
    const caminho = `feeds/${portalSlug}/${arquivo}`;
    const objeto = await env.DADOS_CACHE.get(caminho);

    if (!objeto) {
      return new Response("Feed não encontrado", { status: 404 });
    }

    // Detecta tipo de conteúdo pela extensão
    let contentType = "application/octet-stream";
    if (arquivo.endsWith(".xml")) {
      contentType = "application/xml; charset=utf-8";
    } else if (arquivo.endsWith(".csv")) {
      contentType = "text/csv; charset=utf-8";
    } else if (arquivo.endsWith(".json")) {
      contentType = "application/json; charset=utf-8";
    }

    // Retorna o arquivo com headers corretos
    return new Response(objeto.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600", // Cache por 1 hora
      },
    });
  } catch (erro) {
    console.error(
      `Erro ao servir feed de ${portalSlug} para "${arquivo}":`,
      erro
    );
    return new Response("Erro ao carregar feed", { status: 500 });
  }
}
