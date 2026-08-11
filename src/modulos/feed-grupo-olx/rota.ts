// Rota: GET /feeds/grupo-olx/{slug-corretor}.xml — Serve o arquivo XML gerado
// Seção 4.11 do project.md
//
// Checagem dupla (flag de rede + cota ativa) em tempo de requisição, não
// só na geração do XML (processarGerarXMLGrupoOLX): sem isso, desativar o
// módulo ou a cota do corretor não tinha efeito nenhum sobre o arquivo já
// gravado no R2, que continuava sendo servido publicamente. Decisão de
// limpeza (ver Histórico de Decisões do project.md, seção 11): não
// deletamos o objeto do R2 no ato da desativação — o arquivo antigo fica
// esquecido no bucket, mas a rota passa a responder 404 sempre que o
// módulo/cota não estiver ativo, então ele nunca mais é servido.

import { Env } from "../../index";
import { estaModuloAtivo } from "../../db/queries-modulos";
import { buscarCorrelorPorSlug } from "../../db/queries-corretores";
import { buscarCotaPortal } from "../../db/queries-cotas-portal";

// Rota: GET /feeds/grupo-olx/{slug}.xml
export async function rotaFeedGrupoOLX(
  request: Request,
  url: URL,
  env: Env
): Promise<Response> {
  const slug = url.pathname.split("/").pop()?.replace(".xml", "");

  if (!slug) {
    return new Response("Slug de corretor não fornecido", { status: 400 });
  }

  try {
    const moduloAtivo = await estaModuloAtivo(env.DB, "feed-grupo-olx");
    if (!moduloAtivo) {
      return new Response("Feed não encontrado", { status: 404 });
    }

    const resultado = await buscarCorrelorPorSlug(env.DB, slug);
    if (!resultado) {
      return new Response("Feed não encontrado", { status: 404 });
    }

    const cota = await buscarCotaPortal(env.DB, resultado.corretor.id, "grupo-olx");
    if (!cota || !cota.ativo) {
      return new Response("Feed não encontrado", { status: 404 });
    }

    // Busca o arquivo XML do R2
    const caminho = `feeds/grupo-olx/${slug}.xml`;
    const arquivo = await env.DADOS_CACHE.get(caminho);

    if (!arquivo) {
      return new Response("Feed não encontrado", { status: 404 });
    }

    // Retorna o XML com headers corretos
    return new Response(arquivo.body, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600", // Cache por 1 hora
      },
    });
  } catch (erro) {
    console.error(`Erro ao servir feed do Grupo OLX para "${slug}":`, erro);
    return new Response("Erro ao carregar feed", { status: 500 });
  }
}
