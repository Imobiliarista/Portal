// Roteamento de subdomínio (*.imobiliarista.net)
// Valida corretor e status de liberação do site; visitante recebe o shell
// real da SPA via Static Assets (seção 4.6 do project.md).

import { Env } from "../index";
import { lerJSON } from "../lib/r2";
import type { StatusMinisiteJSON } from "../jobs/gerar-status-minisite";
import { ehRotaPublicacoes, rotaPublicacoes } from "../modulos/publicacoes/rota";
import { obterSessaoCompleta } from "../lib/sessao-destino";

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

  // Validar se o corretor/minisite existe e está liberado — lê o artefato
  // materializado em R2 (jobs/gerar-status-minisite.ts), nunca D1. Este é
  // o caminho de TODO visitante de TODO tenant: a regra "zero D1 no
  // pageview público" (Documento Técnico Edge-First, seção 2/14) depende
  // inteiramente desta leitura não tocar em banco.
  const status = await lerJSON<StatusMinisiteJSON>(
    env.DADOS_CACHE,
    `tenants/${slug}/status.json`,
  );

  if (!status) {
    return new Response(`Corretor "${slug}" não encontrado`, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  if (!status.liberado) {
    return new Response(`Minisite "${slug}" ainda não está disponível\n\nEste site está sendo preparado. Por favor, tente novamente em breve.`, {
      status: 503, // Service Unavailable
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Painel do Superadmin não existe em subdomínio — nunca serve o shell
  // aqui (fechava de novo a exposição da auditoria, só que por outro
  // host). Redireciona pra raiz, onde o gate de verdade roda
  // (routes/painel-gate.ts) com a sessão já válida nos dois hosts (cookie
  // com Domain=imobiliarista.net, ver lib/sessao-destino.ts).
  if (url.pathname === "/painel-admin" || url.pathname.startsWith("/painel-admin/")) {
    return new Response(null, {
      status: 302,
      headers: { location: `https://imobiliarista.net${url.pathname}${url.search}` },
    });
  }

  // Gate de sessão pro shell de /painel/* neste subdomínio — fecha a
  // mesma exposição da auditoria de segurança (HTML do painel servido sem
  // checagem nenhuma via env.ASSETS.fetch), agora pro caminho do
  // corretor. Checa posse (não só "tem sessão válida de algum corretor"):
  // status.corretor_id já veio do status.json deste slug logo acima, sem
  // tocar D1 de novo.
  if (url.pathname === "/painel" || url.pathname.startsWith("/painel/")) {
    const sessao = await obterSessaoCompleta(request, env);
    const autorizado = sessao?.papel === "corretor" && sessao.corretor_id === status.corretor_id;

    if (!autorizado) {
      return new Response(null, { status: 302, headers: { location: "/login/" } });
    }

    return env.ASSETS.fetch(request);
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
