// POST /api/painel-admin/regenerar-cidade/:id — regeneração manual de
// cidade pelo Superadmin (diagnóstico da sessão anterior: anúncios de teste
// inseridos direto no D1 via SQL, sem passar pela API, nunca disparam
// jobs/revalidacao-cruzada.ts — esse fan-out só roda por mutação de anúncio
// pelo painel, e sempre revalida a cidade DAQUELE anúncio editado, nunca uma
// cidade arbitrária. Editar um anúncio de outra cidade não ajuda a cidade
// que precisa ser regenerada). Esta rota fecha o gap: enfileira
// gerar-json-cidade direto pro cidade_id informado, reaproveitando
// jobs/gerar-json-cidade.ts::enfileirarGeracaoJsonCidade — a mesma função
// (mesmo tipo de mensagem, mesmo destino de fila) que
// jobs/revalidacao-cruzada.ts já usa no fan-out normal.
import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { hashSenha } from "../src/lib/senha";
import { processarGerarJsonCidade } from "../src/jobs/gerar-json-cidade";

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
  // Faixa "7" — dedicada a este arquivo (ver comentário equivalente em
  // dashboard-visao-geral.test.ts / sitemap-job-trigger.test.ts).
  const base = String(700000000 + ((contadorCpf * 7919) % 90000000)).padStart(9, "0").slice(-9);
  const d1 = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + d1 + d2;
}

async function seedSuperadmin() {
  const cpf = cpfValido();
  const nomeUsuario = `SUPERADMIN_REGEN_${contadorCpf}`;
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
      "Superadmin Regen Teste",
      cpf,
      `ADMIN-REGEN-${contadorCpf}`,
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

async function seedCorretorAprovado() {
  const cpf = cpfValido();
  const nomeUsuario = `corretorregen${contadorCpf}`;
  const { hash, salt } = await hashSenha("senhaqualquer123");
  const agora = new Date().toISOString();
  const slug = `corretor-regen-${contadorCpf}`;

  const insertCorretor = await env.DB.prepare(
    `INSERT INTO corretores (
      nome_completo, sexo, data_nascimento, nacionalidade, cpf, creci,
      nome_usuario, senha_hash, senha_salt, endereco_residencial, telefone,
      email, status, criado_em, atualizado_em
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      `Corretor Regen Teste ${contadorCpf}`,
      "outro",
      "1990-01-01",
      "brasileira",
      cpf,
      `CRECI-REGEN-${contadorCpf}`,
      nomeUsuario,
      hash,
      salt,
      "Rua de Teste, 100",
      "43999990000",
      `${nomeUsuario}@teste.imobiliarista.net`,
      "aprovado",
      agora,
      agora
    )
    .run();
  const corretorId = insertCorretor.meta.last_row_id as number;

  await env.DB.prepare(
    `INSERT INTO minisites (corretor_id, slug, offline, criado_em, atualizado_em) VALUES (?,?,0,?,?)`
  )
    .bind(corretorId, slug, agora, agora)
    .run();

  return { corretorId, slug };
}

async function buscarUmaCidade(): Promise<{ id: number; nome: string; slug: string }> {
  const row = (await env.DB.prepare("SELECT id, nome FROM cidades LIMIT 1").first()) as
    | { id: number; nome: string }
    | null;
  if (!row) throw new Error("Nenhuma cidade no catálogo IBGE (migration 0003)");
  const slug = row.nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
  return { id: row.id, nome: row.nome, slug };
}

// Espelha exatamente o cenário diagnosticado: INSERT direto em `anuncios`
// via SQL puro, sem passar por routes/api-anuncios-crud.ts (então nenhuma
// revalidação cruzada é disparada por esta inserção).
async function inserirAnuncioDiretoNoD1(corretorId: number, cidadeId: number, titulo: string) {
  const agora = new Date().toISOString();
  const insert = await env.DB.prepare(
    `INSERT INTO anuncios (
      corretor_id, titulo, tipo_negocio_id, categoria_imovel_id, tipo_imovel_id,
      cidade_id, postar_na_rede, vendido_removido, slug, criado_em, atualizado_em
    ) VALUES (?,?,1,1,1,?,1,0,?,?,?)`
  )
    .bind(corretorId, titulo, cidadeId, `${titulo.toLowerCase().replace(/\s+/g, "-")}-teste`, agora, agora)
    .run();
  return insert.meta.last_row_id as number;
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

describe("POST /api/painel-admin/regenerar-cidade/:id", () => {
  it("exige sessão de superadmin (401 sem cookie)", async () => {
    const cidade = await buscarUmaCidade();
    const resposta = await chamar(`/api/painel-admin/regenerar-cidade/${cidade.id}`, { method: "POST" });
    expect(resposta.status).toBe(401);
  });

  it("responde 404 pra cidade_id inexistente", async () => {
    const superadmin = await seedSuperadmin();
    const cookie = await logar(superadmin.nomeUsuario, superadmin.senha);

    const resposta = await chamar("/api/painel-admin/regenerar-cidade/999999999", {
      method: "POST",
      headers: { cookie },
    });
    expect(resposta.status).toBe(404);
  });

  it("enfileira gerar-json-cidade com o cidade_id e cidade_slug corretos", async () => {
    const superadmin = await seedSuperadmin();
    const cookie = await logar(superadmin.nomeUsuario, superadmin.senha);
    const cidade = await buscarUmaCidade();

    const mensagens: Record<string, unknown>[] = [];
    const espiao = vi.spyOn(env.FILA_ALTERACOES, "send").mockImplementation(async (msg: unknown) => {
      mensagens.push(msg as Record<string, unknown>);
    });

    const resposta = await chamar(`/api/painel-admin/regenerar-cidade/${cidade.id}`, {
      method: "POST",
      headers: { cookie },
    });
    espiao.mockRestore();

    expect(resposta.status).toBe(200);
    const msg = mensagens.find((m) => m.tipo === "gerar-json-cidade");
    expect(msg).toBeDefined();
    expect(msg?.cidade_id).toBe(cidade.id);
    expect(msg?.cidade_slug).toBe(cidade.slug);
  });

  it("regenera cidades/{slug}.json incluindo anúncio inserido direto no D1 via SQL (nunca passou pela API)", async () => {
    const superadmin = await seedSuperadmin();
    const cookieSuperadmin = await logar(superadmin.nomeUsuario, superadmin.senha);
    const corretor = await seedCorretorAprovado();
    const cidade = await buscarUmaCidade();

    const anuncioId = await inserirAnuncioDiretoNoD1(
      corretor.corretorId,
      cidade.id,
      "[TESTE] Anúncio inserido direto no D1",
    );

    // Confirma a premissa do bug: sem nenhuma mutação pela API, o JSON da
    // cidade nunca foi (re)gerado — não existe em R2.
    const antes = await env.DADOS_CACHE.get(`cidades/${cidade.slug}.json`);
    expect(antes).toBeNull();

    const mensagens: Record<string, unknown>[] = [];
    const espiao = vi.spyOn(env.FILA_ALTERACOES, "send").mockImplementation(async (msg: unknown) => {
      mensagens.push(msg as Record<string, unknown>);
    });
    const resposta = await chamar(`/api/painel-admin/regenerar-cidade/${cidade.id}`, {
      method: "POST",
      headers: { cookie: cookieSuperadmin },
    });
    espiao.mockRestore();
    expect(resposta.status).toBe(200);

    const msg = mensagens.find((m) => m.tipo === "gerar-json-cidade") as
      | { tipo: "gerar-json-cidade"; cidade_id: number; cidade_slug: string }
      | undefined;
    expect(msg).toBeDefined();

    // Materializa de verdade (bypassando o transporte da Queue, mesma
    // abordagem de funil-completo.test.ts e sitemap-job-trigger.test.ts).
    await processarGerarJsonCidade(msg!, env as any);

    const depois = await env.DADOS_CACHE.get(`cidades/${cidade.slug}.json`);
    expect(depois).not.toBeNull();
    const itens = (await depois!.json()) as Array<{ id: number; titulo: string }>;
    expect(itens.some((i) => i.id === anuncioId)).toBe(true);
  });
});
