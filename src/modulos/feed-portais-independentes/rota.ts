// Rota: GET /feeds/{portal-slug}/{slug-corretor}.{ext} — serve arquivos
// de qualquer portal externo, Grupo OLX incluso (seção 4.11 do
// project.md; reconstrução do feed fundiu feed-grupo-olx aqui).
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
import { buscarCotaPortal } from "../../db/queries-cotas-portal";
import { lerJSON } from "../../lib/r2";
import type { StatusMinisiteJSON } from "../../jobs/gerar-status-minisite";
import { buscarPortalIndependente } from "./gerador";

// Rota: GET /feeds/{portal}/{slug}.{ext}
export async function rotaFeedPortalIndependente(
  request: Request,
  url: URL,
  env: Env
): Promise<Response> {
  // Extrai portal e slug da URL: /feeds/imovelweb/marcos.xml,
  // /feeds/grupo-olx/marcos.xml
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
    const portal = await buscarPortalIndependente(env.DB, portalSlug);
    if (!portal) {
      return new Response("Feed não encontrado", { status: 404 });
    }

    const moduloAtivo = await estaModuloAtivo(env.DB, portal.modulo_flag_slug);
    if (!moduloAtivo) {
      return new Response("Feed não encontrado", { status: 404 });
    }

    const corretorSlug = arquivo.replace(/\.[^.]+$/, "");
    // Lê o artefato materializado em R2 (jobs/gerar-status-minisite.ts) em
    // vez de consultar D1 diretamente — mesmo princípio de routes/minisite.ts
    // (Documento Técnico Edge-First, seções 2/14), aplicado aqui à rota de
    // feed pública.
    const status = await lerJSON<StatusMinisiteJSON>(
      env.DADOS_CACHE,
      `tenants/${corretorSlug}/status.json`,
    );
    if (!status) {
      return new Response("Feed não encontrado", { status: 404 });
    }

    const cota = await buscarCotaPortal(env.DB, status.corretor_id, portalSlug);
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
