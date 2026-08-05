// Roteamento de subdomínio (*.imobiliarista.net)
// Lote 4: valida corretor e status de liberação do site
// Consumo de dados reais fica para lotes posteriores

import { Env } from "../index";
import { buscarCorrelorPorSlug, estaMinisiteLiberado } from "../db/queries-corretores";

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

export async function rotasMinиsite(
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

  // Minisite existe e está liberado
  const conteudo = `Minisite do Corretor: ${resultado.corretor.nome_completo}
Slug: ${slug}
CPF/CRECI: ${resultado.corretor.creci}

[Lote 4 — Minisite reconhecido e liberado]
[Renderização de conteúdo do minisite fica para lotes posteriores]`;

  return new Response(conteudo, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
