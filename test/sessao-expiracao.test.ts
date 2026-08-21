// Reproduz e trava o bug de comparação de string na expiração de sessão
// (auditoria de 2026-08-20, ver project.md Histórico de Decisões) — a
// validação de sessão comparava `expira_em` (ISO 8601 com "T"/"Z", gravado
// por `new Date().toISOString()` em api-auth-login.ts) contra
// `datetime('now')` do SQLite (formato "YYYY-MM-DD HH:MM:SS", sem "T"),
// usando comparação de string (`>`) direto no SQL. Como "T" (0x54) vence
// " " (0x20) em ASCII no 11º caractere, sempre que a data (prefixo
// "YYYY-MM-DD") de expira_em batia com a de "agora", a sessão era aceita
// como válida o dia inteiro, mesmo com o horário já vencido — até ~24h de
// graça além do TTL documentado.
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { hashSenha } from "../src/lib/senha";

const RAIZ = "https://imobiliarista.net";

async function chamar(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(`${RAIZ}${path}`, init as RequestInit) as Promise<Response>;
}

// Gerador de CPF sintático válido (mesmo algoritmo de src/lib/cpf.ts) —
// faixa/contador deliberadamente separados dos usados em
// funil-completo.test.ts (prefixo "5") pra nunca colidir no UNIQUE de
// `corretores.cpf` quando os dois arquivos rodam na mesma instância de D1.
let contadorCpf = 0;
function digitoVerificador(seq: string, mult: number[]): string {
  let soma = 0;
  for (let i = 0; i < seq.length; i++) soma += Number(seq[i]) * mult[i];
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}
function cpfValido(): string {
  contadorCpf++;
  const base = String(500000000 + ((contadorCpf * 7919) % 90000000)).padStart(9, "0").slice(-9);
  const d1 = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + d1 + d2;
}

async function seedCorretorAprovado() {
  const cpf = cpfValido();
  const nomeUsuario = `sessexp${contadorCpf}`;
  const senha = "senhadesessao123";
  const { hash, salt } = await hashSenha(senha);
  const agora = new Date().toISOString();

  const insert = await env.DB.prepare(
    `INSERT INTO corretores (
      nome_completo, cpf, creci, nome_usuario, senha_hash, senha_salt,
      email, status, criado_em, atualizado_em
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      `Corretor Sessão Teste ${contadorCpf}`,
      cpf,
      `CRECI-SESS-${contadorCpf}`,
      nomeUsuario,
      hash,
      salt,
      `${nomeUsuario}@teste.imobiliarista.net`,
      "aprovado",
      agora,
      agora
    )
    .run();

  return { corretorId: insert.meta.last_row_id as number, nomeUsuario, senha };
}

async function logarObtendoSessionId(nomeUsuario: string, senha: string): Promise<string> {
  const resposta = await chamar("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario: nomeUsuario, senha }),
  });
  expect(resposta.status).toBe(200);
  const cookieBruto = resposta.headers.get("set-cookie") || "";
  const sessionId = (cookieBruto.match(/session_id=([^;]*)/) || [])[1];
  expect(sessionId).toBeTruthy();
  return sessionId;
}

describe("Expiração de sessão (auditoria 2026-08-20 — bug de comparação de string)", () => {
  it("rejeita sessão cujo horário de expiração já passou hoje (mesma data UTC de 'agora')", async () => {
    const corretor = await seedCorretorAprovado();
    const sessionId = await logarObtendoSessionId(corretor.nomeUsuario, corretor.senha);

    // Simula TTL já vencido: expira_em = início do dia UTC de hoje (1ms
    // após meia-noite) — já passou em relação a "agora" (exceto no
    // primeiro milissegundo do dia, o que não ocorre num test run real),
    // mas tem o MESMO prefixo "YYYY-MM-DD" que `datetime('now')` do SQLite
    // vai comparar — é exatamente o cenário relatado na auditoria (~24h de
    // graça), não um TTL vencido há dias (esse já era rejeitado
    // corretamente mesmo com o bug, porque aí o prefixo de data já diferia).
    const agora = new Date();
    const inicioDeHojeUTC = new Date(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), 0, 0, 0, 1)
    );
    await env.DB.prepare("UPDATE sessoes SET expira_em = ? WHERE session_id = ?")
      .bind(inicioDeHojeUTC.toISOString(), sessionId)
      .run();

    const respostaSessao = await chamar("/api/auth/sessao", {
      headers: { cookie: `session_id=${sessionId}` },
    });

    // Regressão travada: comparação de string (SQL `expira_em >
    // datetime('now')`) tratava essa sessão vencida como válida — "T"
    // (0x54) vence " " (0x20) no 11º caractere assim que o prefixo de data
    // bate, então o horário nunca chegava a ser comparado de fato.
    expect(respostaSessao.status).toBe(401);
    const corpo = (await respostaSessao.json()) as { autenticado: boolean };
    expect(corpo.autenticado).toBe(false);
  });

  it("continua aceitando sessão dentro do TTL normalmente (não quebra o caso são)", async () => {
    const corretor = await seedCorretorAprovado();
    const sessionId = await logarObtendoSessionId(corretor.nomeUsuario, corretor.senha);

    const respostaSessao = await chamar("/api/auth/sessao", {
      headers: { cookie: `session_id=${sessionId}` },
    });
    expect(respostaSessao.status).toBe(200);
    const corpo = (await respostaSessao.json()) as { autenticado: boolean };
    expect(corpo.autenticado).toBe(true);
  });

  it("rejeita sessão com TTL vencido há dias (data já diferente — caso que o bug não mascarava)", async () => {
    const corretor = await seedCorretorAprovado();
    const sessionId = await logarObtendoSessionId(corretor.nomeUsuario, corretor.senha);

    const dezDiasAtras = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await env.DB.prepare("UPDATE sessoes SET expira_em = ? WHERE session_id = ?")
      .bind(dezDiasAtras.toISOString(), sessionId)
      .run();

    const respostaSessao = await chamar("/api/auth/sessao", {
      headers: { cookie: `session_id=${sessionId}` },
    });
    expect(respostaSessao.status).toBe(401);
  });
});
