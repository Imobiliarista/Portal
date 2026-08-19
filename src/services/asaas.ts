// Cliente HTTP para a API do Asaas (sandbox) — infraestrutura da Fase 3
// (project.md, seções 2.1/2.3/3). Módulo isolado: nenhuma função aqui
// tem qualquer vínculo com o fluxo real de cobrança dos planos
// (queries-planos.ts, painel-corretor.ts) — existe pronto pra ser ligado
// quando a Fase 3 for decidida, sem exigir mudança de contrato quando
// isso acontecer.
//
// Desativado por padrão via ASAAS_ATIVO (env, default "false" — ver
// wrangler.toml/.env.example): toda função exportada checa a flag
// primeiro e nunca faz a chamada HTTP real quando ela não é
// exatamente "true". Isso é verificado aqui, não só no chamador — um
// futuro chamador que esqueça de checar a flag continua seguro.

import { Env } from "../index";

const ASAAS_SANDBOX_BASE_URL = "https://api-sandbox.asaas.com/v3";

export interface AsaasCliente {
  id: string;
  name: string;
  email?: string;
  cpfCnpj: string;
}

export interface AsaasCobranca {
  id: string;
  customer: string;
  status: string;
  value: number;
  dueDate: string;
  billingType: string;
}

// Resultado explícito em vez de lançar exceção pro caminho "desativado"
// — módulo desligado não é uma falha inesperada, é o estado padrão, e o
// chamador precisa poder distinguir isso de um erro real da API.
export type ResultadoAsaas<T> =
  | { ok: true; dados: T }
  | {
      ok: false;
      motivo: "modulo_desativado" | "chave_ausente" | "erro_api";
      detalhe?: string;
    };

function moduloAtivo(env: Env): boolean {
  return env.ASAAS_ATIVO === "true";
}

async function chamarApiAsaas<T>(
  env: Env,
  caminho: string,
  init: RequestInit = {},
): Promise<ResultadoAsaas<T>> {
  if (!moduloAtivo(env)) {
    return { ok: false, motivo: "modulo_desativado" };
  }

  const apiKey = env.ASAAS_SANDBOX_API_KEY;
  if (!apiKey) {
    console.error("ASAAS_ATIVO=true mas ASAAS_SANDBOX_API_KEY não configurada");
    return { ok: false, motivo: "chave_ausente" };
  }

  try {
    const resposta = await fetch(`${ASAAS_SANDBOX_BASE_URL}${caminho}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        // Header de autenticação da API do Asaas — nome exato exigido
        // pela própria API (não é convenção nossa).
        access_token: apiKey,
        ...(init.headers || {}),
      },
    });

    if (!resposta.ok) {
      const texto = await resposta.text();
      console.error(`Erro na API do Asaas (${resposta.status}) em ${caminho}:`, texto);
      return { ok: false, motivo: "erro_api", detalhe: `${resposta.status}: ${texto}` };
    }

    const dados = (await resposta.json()) as T;
    return { ok: true, dados };
  } catch (erro) {
    console.error(`Erro de rede chamando a API do Asaas em ${caminho}:`, erro);
    return { ok: false, motivo: "erro_api", detalhe: String(erro) };
  }
}

// POST /customers — cria o cliente (corretor) no Asaas, pré-requisito
// pra qualquer cobrança. CPF/CNPJ é o identificador que o Asaas usa pra
// deduplicar clientes do lado deles.
export async function criarClienteAsaas(
  env: Env,
  dados: { name: string; cpfCnpj: string; email?: string },
): Promise<ResultadoAsaas<AsaasCliente>> {
  return chamarApiAsaas<AsaasCliente>(env, "/customers", {
    method: "POST",
    body: JSON.stringify(dados),
  });
}

// POST /payments — cria uma cobrança avulsa pra um cliente já existente
// no Asaas. billingType "UNDEFINED" deixa o Asaas oferecer todas as
// formas de pagamento disponíveis (boleto/cartão/Pix) ao pagador, em vez
// de fixar uma — decisão de UX de cobrança fica pra quando a Fase 3
// for de fato ativada, não hardcoded aqui.
export async function criarCobrancaAsaas(
  env: Env,
  dados: { customer: string; value: number; dueDate: string; billingType?: string; description?: string },
): Promise<ResultadoAsaas<AsaasCobranca>> {
  return chamarApiAsaas<AsaasCobranca>(env, "/payments", {
    method: "POST",
    body: JSON.stringify({ billingType: "UNDEFINED", ...dados }),
  });
}

// GET /payments/{id} — consulta o status atual de uma cobrança
// (PENDING/RECEIVED/CONFIRMED/OVERDUE/etc., vocabulário do próprio
// Asaas). Sem cache aqui — decisão de quando/como cachear fica pra
// quando houver um chamador real.
export async function consultarStatusCobrancaAsaas(
  env: Env,
  cobrancaId: string,
): Promise<ResultadoAsaas<AsaasCobranca>> {
  return chamarApiAsaas<AsaasCobranca>(env, `/payments/${cobrancaId}`, {
    method: "GET",
  });
}
