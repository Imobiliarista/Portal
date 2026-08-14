// Roteamento de subdomínio (*.imobiliarista.net)
// Valida corretor e status de liberação do site; visitante recebe o shell
// real da SPA via Static Assets (seção 4.6 do project.md).

import { Env } from "../index";
import { buscarCorrelorPorSlug, estaMinisiteLiberado } from "../db/queries-corretores";
import { ehRotaPublicacoes, rotaPublicacoes } from "../modulos/publicacoes/rota";

function extrairSlugDoSubdominio(hostname: string): string | null {
  // Formato esperado: {slug}.imobiliarista.net
  const partes = hostname.split(".");

  // Deve ter pelo menos 3 partes: slug.imobiliarista.net
  if (partes.length < 3) {
    return null;
  }

  // Pega a primeira parte (slug)
  const slug = partes[0];

  // Valida: slug não pode ser vazio, e o restante deve ser "imobiliarista.net"
  if (!slug || slug.length === 0) {
    return null;
  }

  return slug.toLowerCase();
}

export async function rotasMinisite(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const slug = extrairSlugDoSubdominio(url.hostname);

  // Hostname inválido ou não é subdomínio esperado
  if (!slug) {
    return new Response("Subdomínio inválido", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Validar se o corretor/minisite existe
  const resultado = await buscarCorrelorPorSlug(env.DB, slug);

  if (!resultado) {
    return new Response(`Corretor "${slug}" não encontrado`, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Verificar se o minisite está liberado
  const liberado = await estaMinisiteLiberado(env.DB, slug);

  if (!liberado) {
    return new Response(`Minisite "${slug}" ainda não está disponível\n\nEste site está sendo preparado. Por favor, tente novamente em breve.`, {
      status: 503, // Service Unavailable
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Módulo Publicações (Lote 16, seção 4.19) — path routing, /publicacoes
  // e /publicacoes/{id-do-post}, tratado aqui conforme decisão fechada.
  if (ehRotaPublicacoes(url.pathname)) {
    return rotaPublicacoes(request, url, env);
  }

  // Minisite existe e está liberado: shell real da SPA via Static Assets
  // (seção 4.6). Dados do corretor/anúncios são resolvidos no client-side,
  // direto do JSON no R2 — não aqui.
  return env.ASSETS.fetch(request);
}
