// Reproduz e trava os crashes descritos na auditoria de 2026-08-20: tanto
// o consumer da fila principal (src/queue.ts) quanto o da dead letter
// queue (src/queue-dlq.ts, Lote 23) deixavam uma mensagem malformada
// derrubar o processamento do resto do batch.
//
// Causa raiz (confirmada lendo o código, não presumida):
// - src/queue.ts: `msg.tipo` era acessado sem validar que `msg` (o body
//   da mensagem) era um objeto — pra um body nulo/indefinido isso lança
//   TypeError. O `catch` também lia `msg.tipo` (pro log de erro), então o
//   mesmo TypeError escapava de novo ali, sem try/catch por fora do loop
//   — derrubando o processamento das mensagens seguintes do batch.
// - src/queue-dlq.ts: não tinha NENHUM try/catch ao redor do
//   processamento de cada mensagem — qualquer exceção (serialização,
//   payload inesperado dentro de enviarAlertaDlq) derrubava o loop
//   inteiro, deixando a própria mensagem sem `ack()` (retentando dentro
//   da DLQ, que não tem outra dead_letter_queue configurada atrás dela) e
//   as mensagens seguintes do batch sem processar.
//
// Ver project.md, Histórico de Decisões.
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { processarFilaAlteracoes } from "../src/queue";
import { processarFilaMorta } from "../src/queue-dlq";

function criarMensagem(body: unknown) {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    body,
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

// Fake mínimo de MessageBatch — as duas funções só usam `.messages`
// (cada item com `.body`, `.ack()`, `.retry()`), então não precisamos de
// uma fila Cloudflare real pra exercitar o bug.
function criarBatch(bodies: unknown[]) {
  return {
    messages: bodies.map(criarMensagem),
    queue: "imob-queue-test",
    metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
    retryAll: vi.fn(),
    ackAll: vi.fn(),
  };
}

describe("Fila principal (imob-queue) — mensagem malformada não pode derrubar o batch (auditoria 2026-08-20)", () => {
  it("body nulo é descartado (ack, sem retry) e não impede o processamento das demais mensagens do batch", async () => {
    const batch = criarBatch([
      null, // malformado: sem "tipo" — acessar msg.tipo lançava TypeError não capturado
      {}, // malformado: objeto sem campo "tipo" em string
      { tipo: "tipo-desconhecido-teste-xyz" }, // bem-formada, cai no branch de tipo desconhecido (não toca D1/R2)
    ]);

    // Antes da correção, isto rejeita (o TypeError de `msg.tipo` escapa
    // do próprio catch, sem try/catch por fora do loop).
    await expect(
      processarFilaAlteracoes(batch as any, env as any),
    ).resolves.toBeUndefined();

    const [msgNula, msgSemTipo, msgBoa] = batch.messages;

    expect(msgNula.ack).toHaveBeenCalledTimes(1);
    expect(msgNula.retry).not.toHaveBeenCalled();

    expect(msgSemTipo.ack).toHaveBeenCalledTimes(1);
    expect(msgSemTipo.retry).not.toHaveBeenCalled();

    // A mensagem bem-formada depois da malformada precisa continuar
    // sendo processada normalmente.
    expect(msgBoa.ack).toHaveBeenCalledTimes(1);
  });
});

describe("Dead letter queue (imob-queue-dlq) — mensagem malformada não pode derrubar o batch (auditoria 2026-08-20)", () => {
  it("body sem referência circular mas com body sem campo 'tipo' é descartado sem chamar o alerta por e-mail, e não impede o resto do batch", async () => {
    const batch = criarBatch([
      null, // malformado
      {}, // malformado: sem campo "tipo"
      { tipo: "tipo-desconhecido-teste-dlq" }, // bem-formada
    ]);

    await expect(
      processarFilaMorta(batch as any, env as any),
    ).resolves.toBeUndefined();

    const [msgNula, msgSemTipo, msgBoa] = batch.messages;
    expect(msgNula.ack).toHaveBeenCalledTimes(1);
    expect(msgSemTipo.ack).toHaveBeenCalledTimes(1);
    expect(msgBoa.ack).toHaveBeenCalledTimes(1);
  });

  it("body com referência circular (falha ao serializar) é logado e descartado sem derrubar o resto do batch — o tratador de último nível precisa ser mais defensivo que a fila principal", async () => {
    const comReferenciaCircular: Record<string, unknown> = {
      tipo: "gerar-json-cidade",
    };
    comReferenciaCircular.self = comReferenciaCircular; // JSON.stringify lança TypeError nisso

    const batch = criarBatch([
      comReferenciaCircular,
      { tipo: "tipo-desconhecido-teste-dlq-2" },
    ]);

    // Antes da correção, JSON.stringify(msg) (sem try/catch ao redor) já
    // derrubava o loop inteiro nesta primeira mensagem.
    await expect(
      processarFilaMorta(batch as any, env as any),
    ).resolves.toBeUndefined();

    const [msgCircular, msgBoa] = batch.messages;
    expect(msgCircular.ack).toHaveBeenCalledTimes(1);
    expect(msgBoa.ack).toHaveBeenCalledTimes(1);
  });
});
