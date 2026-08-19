// Endpoint receptor de webhooks do Asaas — infraestrutura da Fase 3
// (project.md, seção 2.3), isolado e sem qualquer ligação com o fluxo
// real de troca de plano (queries-planos.ts, painel-corretor.ts).
//
// Hoje, com ou sem ASAAS_ATIVO=true: valida o token de segurança do
// webhook, loga o evento recebido, e nunca processa nada. Processar de
// verdade (atualizar status de cobrança, refletir isso no corretor) é
// decisão de implementação separada, de quando a Fase 3 for ativada de
// fato — não existe ainda, e este endpoint nunca finge que existe.

import { Env } from "../../index";

interface EventoWebhookAsaas {
  event?: string;
  payment?: { id?: string; status?: string; customer?: string };
  [chave: string]: unknown;
}

function tokenValido(request: Request, env: Env): boolean {
  const tokenConfigurado = env.ASAAS_WEBHOOK_TOKEN;
  if (!tokenConfigurado) {
    // Sem token configurado, nunca aceita — não dá pra validar
    // autenticidade nenhuma, e um webhook aberto seria uma porta de
    // entrada não autenticada pro Worker.
    return false;
  }

  // Header usado pelo Asaas pra entregar o token configurado no
  // cadastro do webhook (asaas-access-token) — nome exato exigido pela
  // própria API, não é convenção nossa.
  const tokenRecebido = request.headers.get("asaas-access-token");
  return tokenRecebido === tokenConfigurado;
}

export async function rotaWebhookAsaas(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ erro: "Método não permitido" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!tokenValido(request, env)) {
    console.error("Webhook Asaas: token inválido ou ausente");
    return new Response(JSON.stringify({ erro: "Não autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let evento: EventoWebhookAsaas;
  try {
    evento = await request.json();
  } catch (erro) {
    console.error("Webhook Asaas: corpo inválido", erro);
    return new Response(JSON.stringify({ erro: "Corpo inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ativo = env.ASAAS_ATIVO === "true";

  // Log-only, sempre — nunca silenciar. Mesmo com ASAAS_ATIVO=true não
  // há processamento real implementado ainda (fora do escopo desta
  // infraestrutura), então o log deixa isso explícito nos dois casos em
  // vez de fingir sucesso.
  console.log(
    `Webhook Asaas recebido: evento="${evento.event ?? "desconhecido"}", ` +
      `pagamento=${evento.payment?.id ?? "-"}, status=${evento.payment?.status ?? "-"}. ` +
      `ASAAS_ATIVO=${ativo} — nenhum processamento implementado ainda, só log.`,
  );

  // Sempre 200 depois de autenticar e parsear com sucesso: o Asaas
  // reenvia o webhook em retry se não receber 2xx, e como nada é
  // processado ainda, não há nenhum outro motivo legítimo de falha
  // aqui além dos já tratados acima (auth/formato).
  return new Response(JSON.stringify({ recebido: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
