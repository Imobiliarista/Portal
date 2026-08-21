// GET /api/painel-admin/visao-geral — Dashboard do Superadmin (console mostrava
// "TypeError: Cannot read properties of undefined (reading 'corretores_totais')"
// em painel-superadmin.js:79). Causa raiz confirmada lendo o código (não
// presumida): painel-superadmin.js:79-85 lê `dados.dados.X` — mesmo padrão de
// envelope usado por TODAS as outras rotas deste arquivo (ver
// carregarMinisites/carregarPreCadastros/carregarCidades/carregarModulos, e
// os respectivos handlers em routes/painel-superadmin.ts, que sempre
// respondem `respostaSucesso({ dados: ... })`). Só rotaVisaoGeral era a
// exceção: respondia `respostaSucesso(visao)` sem envelope, um objeto plano
// — a rota nunca dava erro 500, só devolvia um formato diferente do que o
// resto do arquivo (front e back) já usa. Corrigido no backend (o lado
// minoritário), não no front, pra manter o padrão já estabelecido no
// restante do arquivo.
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { hashSenha } from "../src/lib/senha";

async function chamar(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(`https://imobiliarista.net${path}`, init as RequestInit) as Promise<Response>;
}

function extrairCookie(resposta: Response): string {
  const bruto = resposta.headers.get("set-cookie") || "";
  const m = bruto.match(/session_id=([^;]*)/);
  return m ? `session_id=${m[1]}` : "";
}

let contadorCpf = 0;
function digitoVerificador(seq: string, mult: number[]): string {
  let soma = 0;
  for (let i = 0; i < seq.length; i++) soma += Number(seq[i]) * mult[i];
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}
function cpfValido(): string {
  contadorCpf++;
  // Faixa "8" — dedicada a este arquivo, não colide com as faixas já usadas
  // em funil-completo.test.ts ("1"), sessao-expiracao.test.ts ("5") e
  // sitemap-job-trigger.test.ts ("9") quando os arquivos rodam juntos
  // contra a mesma instância de D1.
  const base = String(800000000 + ((contadorCpf * 7919) % 90000000)).padStart(9, "0").slice(-9);
  const d1 = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + d1 + d2;
}

async function seedSuperadmin() {
  const cpf = cpfValido();
  const nomeUsuario = `SUPERADMIN_DASH_${contadorCpf}`;
  const senha = "SenhaSuperadmin!123";
  const { hash, salt } = await hashSenha(senha);
  const agora = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO corretores (
      nome_completo, cpf, creci, nome_usuario, senha_hash, senha_salt,
      email, status, papel, criado_em, atualizado_em
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      "Superadmin Dashboard Teste",
      cpf,
      `ADMIN-DASH-${contadorCpf}`,
      nomeUsuario,
      hash,
      salt,
      `${nomeUsuario.toLowerCase()}@imobiliarista.net`,
      "aprovado",
      "superadmin",
      agora,
      agora
    )
    .run();

  return { nomeUsuario, senha };
}

async function logar(usuario: string, senha: string): Promise<string> {
  const resposta = await chamar("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario, senha }),
  });
  expect(resposta.status).toBe(200);
  const cookie = extrairCookie(resposta);
  expect(cookie).not.toBe("");
  return cookie;
}

describe("Dashboard do Superadmin — GET /api/painel-admin/visao-geral", () => {
  it("responde com envelope { dados: {...} } — mesmo formato usado pelo resto do painel-superadmin.js", async () => {
    const superadmin = await seedSuperadmin();
    const cookie = await logar(superadmin.nomeUsuario, superadmin.senha);

    const resposta = await chamar("/api/painel-admin/visao-geral", {
      headers: { cookie },
    });
    expect(resposta.status).toBe(200);

    const corpo = (await resposta.json()) as Record<string, unknown>;

    // Regressão travada: painel-superadmin.js:79 lê `dados.dados.corretores_totais`.
    // Antes desta correção o backend respondia plano (`corretores_totais` na
    // raiz, `dados` ausente) — o mesmo `fetch` que o dashboard real faz, e é
    // exatamente essa leitura que quebrava com "Cannot read properties of
    // undefined (reading 'corretores_totais')".
    expect(corpo.dados).toBeDefined();
    const dados = corpo.dados as Record<string, unknown>;
    expect(typeof dados.corretores_totais).toBe("number");
    expect(typeof dados.corretores_aprovados).toBe("number");
    expect(typeof dados.corretores_pendentes).toBe("number");
    expect(typeof dados.corretores_reprovados).toBe("number");
    expect(typeof dados.anuncios_totais).toBe("number");
    expect(typeof dados.anuncios_na_rede).toBe("number");
    expect(typeof dados.anuncios_privados).toBe("number");

    // Nenhum campo solto na raiz — só o envelope, mesmo padrão do resto do arquivo.
    expect(corpo.corretores_totais).toBeUndefined();
  });

  it("continua exigindo sessão de superadmin (401 sem cookie)", async () => {
    const resposta = await chamar("/api/painel-admin/visao-geral");
    expect(resposta.status).toBe(401);
  });
});
