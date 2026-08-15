// Gate de sessão pro shell estático dos painéis na raiz — /painel/* e
// /painel-admin/* (public/painel/index.html e public/painel-admin/index.html,
// servidos via env.ASSETS.fetch). Fecha a exposição encontrada na
// auditoria de segurança: a checagem de sessão existia só nas rotas de
// API (/api/painel-corretor/*, /api/painel-admin/*), nunca no HTML do
// shell em si — qualquer visitante sem cookie via ASSETS.fetch direto.
//
// Chamado de src/index.ts SÓ quando ehDominioRaiz(url.hostname) é true —
// o equivalente pra subdomínio (nome.imobiliarista.net/painel/) vive em
// routes/minisite.ts, que já tem o corretor_id do dono do minisite à mão
// (leitura do status.json em R2) pra checar posse, não só sessão válida.
//
// Na raiz não existe "dono" — é sempre superadmin, com uma única exceção
// deliberada: corretor recém-aprovado (ou ainda pendente) sem minisite
// liberado, que fica na raiz numa versão do próprio shell do corretor
// (public/painel/index.html já mostra o badge "Site offline — Aguardando
// aprovação" pra esse caso — não existe hoje uma tela dedicada de
// "criar/configurar minisite" além dessa, então reaproveitamos a mesma).

import { Env } from "../index";
import { obterSessaoCompleta, calcularDestinoPosLogin } from "../lib/sessao-destino";

function redirecionar(destino: string): Response {
  return new Response(null, { status: 302, headers: { location: destino } });
}

// destino (sempre absoluto, ver sessao-destino.ts) aponta pra ESTA mesma
// URL que já está sendo servida? Evita um redirect desnecessário quando a
// sessão já está no lugar certo.
function apontaParaCa(url: URL, destino: string): boolean {
  const destinoUrl = new URL(destino);
  if (destinoUrl.hostname !== url.hostname) return false;
  const base = destinoUrl.pathname; // sempre com barra final, ex: "/painel/"
  return url.pathname === base || url.pathname === base.slice(0, -1) || url.pathname.startsWith(base);
}

export async function servirPainelRaiz(request: Request, env: Env, url: URL): Promise<Response> {
  const sessao = await obterSessaoCompleta(request, env);

  if (!sessao) {
    return redirecionar("/login/");
  }

  const destino = calcularDestinoPosLogin(sessao);

  if (!apontaParaCa(url, destino)) {
    return redirecionar(destino);
  }

  return env.ASSETS.fetch(request);
}
