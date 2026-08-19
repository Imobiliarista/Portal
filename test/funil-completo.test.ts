// Smoke test de integração — Lote 19 (project.md, seção 10)
//
// Cobre em automação o roteiro que seis auditorias manuais precisaram
// repetir à mão (Histórico de Decisões, seção 11): pré-cadastro → aprovação
// → login → CRUD de anúncio → geração em lote → troca de plano → PWA →
// publicações → backup. Cada bloco abaixo referencia a regressão real que
// documentou o comportamento esperado.
//
// Roda dentro do runtime real dos Workers via Miniflare (D1/R2/Queue
// reais, mesmo binding do wrangler.toml) — não são mocks de D1/R2.
//
// Decisão deliberada: a validação do Turnstile (POST /api/auth/pre-cadastro)
// faz uma chamada de rede real pra challenges.cloudflare.com. Esta versão
// do @cloudflare/vitest-pool-workers não expõe mais `fetchMock` (removido
// em favor de @msw/cloudflare, ainda em 0.0.x — não maduro o suficiente
// pra depender dele aqui). Testamos a validação de campos do pré-cadastro
// (item 1) contra o endpoint HTTP real — falha antes de chegar no
// Turnstile — e usamos inserts diretos em D1 (espelhando exatamente os
// INSERTs de handlePreCadastro) só como fixture pra alimentar o funil de
// aprovação em diante, sem reimplementar a lógica de validação.
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { hashSenha } from "../src/lib/senha";
import { processarGerarJsonCidade } from "../src/jobs/gerar-json-cidade";
import { processarGerarJsonCorretor } from "../src/jobs/gerar-json-corretor";
import { sincronizarArtefatosPwaDoCorretor } from "../src/modulos/pwa/logica";
import { trocarPlanoDoCorretor } from "../src/db/queries-planos";

const RAIZ = "https://imobiliarista.net";

async function chamar(path: string, init?: RequestInit & { host?: string }): Promise<Response> {
  const hostname = init?.host ? `https://${init.host}` : RAIZ;
  return exports.default.fetch(`${hostname}${path}`, init as RequestInit) as Promise<Response>;
}

function extrairCookie(resposta: Response): string {
  const bruto = resposta.headers.get("set-cookie") || "";
  const m = bruto.match(/session_id=([^;]*)/);
  return m ? `session_id=${m[1]}` : "";
}

// Gerador de CPF sintático válido (mesmo algoritmo de src/lib/cpf.ts) —
// cada fixture precisa de um CPF único (UNIQUE em `corretores`).
let contadorCpf = 0;
function digitoVerificador(seq: string, mult: number[]): string {
  let soma = 0;
  for (let i = 0; i < seq.length; i++) soma += Number(seq[i]) * mult[i];
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}
function cpfValido(): string {
  contadorCpf++;
  const base = String(123456700 + contadorCpf * 7919 % 900000000).padStart(9, "0").slice(-9);
  const d1 = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + d1 + d2;
}

async function buscarIdPlano(nome: string): Promise<number> {
  const row = (await env.DB.prepare("SELECT id FROM planos WHERE nome = ? LIMIT 1").bind(nome).first()) as
    | { id: number }
    | null;
  if (!row) throw new Error(`Plano "${nome}" não encontrado no seed da migration 0010`);
  return row.id;
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

// Espelha os INSERTs de handlePreCadastro (routes/api-auth-cadastro.ts) —
// usado só como fixture pros testes de aprovação em diante (item 1 já
// cobre a validação do endpoint real).
async function seedPreCadastro(opts: { senha: string }) {
  const cpf = cpfValido();
  const nomeUsuario = `corretor${contadorCpf}`;
  const { hash, salt } = await hashSenha(opts.senha);
  const agora = new Date().toISOString();

  const insertCorretor = await env.DB.prepare(
    `INSERT INTO corretores (
      nome_completo, sexo, data_nascimento, nacionalidade, cpf, creci,
      nome_usuario, senha_hash, senha_salt, endereco_residencial, telefone,
      email, status, criado_em, atualizado_em
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      `Corretor Teste ${contadorCpf}`,
      "outro",
      "1990-01-01",
      "brasileira",
      cpf,
      `CRECI-${contadorCpf}`,
      nomeUsuario,
      hash,
      salt,
      "Rua de Teste, 100",
      "43999990000",
      `${nomeUsuario}@teste.imobiliarista.net`,
      "pre-cadastro",
      agora,
      agora
    )
    .run();
  const corretorId = insertCorretor.meta.last_row_id as number;

  const insertPreCadastro = await env.DB.prepare(
    `INSERT INTO pre_cadastros (
      corretor_id, nome, email, telefone, creci, aceite_termos_em,
      versao_termos_aceita, status, criado_em, atualizado_em
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      corretorId,
      `Corretor Teste ${contadorCpf}`,
      `${nomeUsuario}@teste.imobiliarista.net`,
      "43999990000",
      `CRECI-${contadorCpf}`,
      agora,
      "1.0.0",
      "pendente",
      agora,
      agora
    )
    .run();
  const preCadastroId = insertPreCadastro.meta.last_row_id as number;

  const slug = `corretor-teste-${contadorCpf}`;
  await env.DB.prepare(
    `INSERT INTO minisites (corretor_id, slug, offline, criado_em, atualizado_em) VALUES (?,?,1,?,?)`
  )
    .bind(corretorId, slug, agora, agora)
    .run();

  await env.DB.prepare(
    `INSERT INTO config_upload_corretor (corretor_id, max_resolucao_upload_bytes, criado_em, atualizado_em) VALUES (?,?,?,?)`
  )
    .bind(corretorId, 5_000_000, agora, agora)
    .run();

  return { corretorId, preCadastroId, cpf, nomeUsuario, slug };
}

async function seedSuperadmin() {
  const cpf = cpfValido();
  const nomeUsuario = `SUPERADMIN_TESTE_${contadorCpf}`;
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
      "Superadmin Teste",
      cpf,
      `ADMIN-${contadorCpf}`,
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

describe("Funil completo do corretor (Lote 19)", () => {
  let superadmin: { nomeUsuario: string; senha: string };
  let cookieSuperadmin: string;

  beforeAll(async () => {
    superadmin = await seedSuperadmin();
    cookieSuperadmin = await logar(superadmin.nomeUsuario, superadmin.senha);
  });

  // ============================================================
  // 1. Pré-cadastro — validação de campos obrigatórios (seção 6.1.1)
  // ============================================================
  describe("1. Pré-cadastro", () => {
    it("rejeita corpo sem cpf/nome_usuario/sexo/data_nascimento/nacionalidade/endereco_residencial", async () => {
      const { total: antes } = (await env.DB.prepare("SELECT COUNT(*) as total FROM corretores").first()) as {
        total: number;
      };

      const resposta = await chamar("/api/auth/pre-cadastro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: "Fulano de Teste",
          email: "fulano@teste.com",
          telefone: "43999990000",
          creci: "CRECI-999",
          senha: "senhavalida123",
          turnstile_token: "irrelevante-nao-deve-ser-avaliado",
          aceita_termos: true,
          // cpf/nome_usuario/sexo/data_nascimento/nacionalidade/endereco_residencial
          // deliberadamente ausentes.
        }),
      });

      expect(resposta.status).toBe(400);
      const corpo = (await resposta.json()) as { erro: string };
      expect(corpo.erro).toBeTruthy();

      // Regressão travada: handlePreCadastro nunca chega a tentar o INSERT
      // (que quebraria com SQLITE_CONSTRAINT em corretores.cpf) quando um
      // campo de 6.1.1 falta — a validação roda antes.
      const { total: depois } = (await env.DB.prepare("SELECT COUNT(*) as total FROM corretores").first()) as {
        total: number;
      };
      expect(depois).toBe(antes);
    });
  });

  // ============================================================
  // 2. Aprovação — promove o corretor já existente, nunca duplica
  // ============================================================
  describe("2. Aprovação do pré-cadastro", () => {
    it("promove o corretor via pre_cadastros.corretor_id, sem criar duplicata", async () => {
      const fixture = await seedPreCadastro({ senha: "senhadocorretor123" });

      const resposta = await chamar(`/api/painel-admin/pre-cadastro/${fixture.preCadastroId}/aprovar`, {
        method: "POST",
        headers: { cookie: cookieSuperadmin, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(resposta.status).toBe(200);

      // Regressão travada: aprovarPreCadastro fazia UPDATE, não INSERT —
      // um corretor duplicado com credenciais vazias era o bug original.
      const { total } = (await env.DB.prepare("SELECT COUNT(*) as total FROM corretores WHERE cpf = ?")
        .bind(fixture.cpf)
        .first()) as { total: number };
      expect(total).toBe(1);

      const corretor = (await env.DB.prepare("SELECT status, plano_id, senha_hash FROM corretores WHERE id = ?")
        .bind(fixture.corretorId)
        .first()) as { status: string; plano_id: number | null; senha_hash: string };
      expect(corretor.status).toBe("aprovado");
      expect(corretor.plano_id).not.toBeNull();
      expect(corretor.senha_hash).toBeTruthy(); // credencial original preservada

      const minisite = (await env.DB.prepare("SELECT offline FROM minisites WHERE corretor_id = ?")
        .bind(fixture.corretorId)
        .first()) as { offline: number };
      expect(minisite.offline).toBe(0);
    });

    it("enfileira gerar-json-corretor na aprovação e materializa corretores/{slug}.json mesmo sem nenhum anúncio", async () => {
      const fixture = await seedPreCadastro({ senha: "senhasemanuncio123" });

      const mensagensEnfileiradas: Record<string, unknown>[] = [];
      const espiao = vi.spyOn(env.FILA_ALTERACOES, "send").mockImplementation(async (msg: unknown) => {
        mensagensEnfileiradas.push(msg as Record<string, unknown>);
      });

      const resposta = await chamar(`/api/painel-admin/pre-cadastro/${fixture.preCadastroId}/aprovar`, {
        method: "POST",
        headers: { cookie: cookieSuperadmin, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(resposta.status).toBe(200);

      espiao.mockRestore();

      // Regressão travada: rotaAprovarPreCadastro só enfileirava
      // gerar-status-minisite — um corretor aprovado sem nenhum anúncio
      // nunca ganhava corretores/{slug}.json, porque o único outro gatilho
      // do job era mutação de anúncio (jobs/revalidacao-cruzada.ts). Ver
      // Histórico de Decisões em project.md.
      const mensagemJsonCorretor = mensagensEnfileiradas.find((m) => m.tipo === "gerar-json-corretor");
      expect(mensagemJsonCorretor).toBeDefined();
      expect(mensagemJsonCorretor?.corretor_slug).toBe(fixture.slug);

      // Materializa de verdade (bypassando o transporte da Queue, mesma
      // abordagem já usada nos demais testes deste arquivo) e confirma que
      // o job lida bem com zero anúncios — array vazio, não falha.
      await processarGerarJsonCorretor({ tipo: "gerar-json-corretor", corretor_slug: fixture.slug }, env as any);

      const objetoR2 = await env.DADOS_CACHE.get(`corretores/${fixture.slug}.json`);
      expect(objetoR2).not.toBeNull();
      const jsonCorretor = (await objetoR2!.json()) as {
        listings: unknown[];
        modulosAtivos: Record<string, boolean>;
      };
      expect(jsonCorretor.listings).toEqual([]);
      expect(jsonCorretor.modulosAtivos).toBeDefined();
    });
  });

  // ============================================================
  // 3. Login — sessão persistida de verdade
  // ============================================================
  describe("3. Login e sessão", () => {
    it("persiste session_id em `sessoes` e GET /api/auth/sessao confirma autenticado", async () => {
      const fixture = await seedPreCadastro({ senha: "senhadocorretor456" });
      await chamar(`/api/painel-admin/pre-cadastro/${fixture.preCadastroId}/aprovar`, {
        method: "POST",
        headers: { cookie: cookieSuperadmin, "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const cookie = await logar(fixture.nomeUsuario, "senhadocorretor456");

      // Regressão travada: handleLogin emitia um cookie que nunca era
      // persistido em `sessoes` — nenhuma rota autenticada funcionava.
      const sessionId = cookie.replace("session_id=", "");
      const { total } = (await env.DB.prepare("SELECT COUNT(*) as total FROM sessoes WHERE session_id = ?")
        .bind(sessionId)
        .first()) as { total: number };
      expect(total).toBe(1);

      const respostaSessao = await chamar("/api/auth/sessao", { headers: { cookie } });
      expect(respostaSessao.status).toBe(200);
      const corpo = (await respostaSessao.json()) as { autenticado: boolean; corretor_id: number };
      expect(corpo.autenticado).toBe(true);
      expect(corpo.corretor_id).toBe(fixture.corretorId);
    });
  });

  // ============================================================
  // 4. CRUD de anúncio — a integração recuperada nas PRs #56/#59
  // ============================================================
  describe("4. CRUD de anúncio via /api/painel-corretor + /api/anuncios", () => {
    async function corretorAprovadoLogado() {
      const fixture = await seedPreCadastro({ senha: "senhadocorretor789" });
      await chamar(`/api/painel-admin/pre-cadastro/${fixture.preCadastroId}/aprovar`, {
        method: "POST",
        headers: { cookie: cookieSuperadmin, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const cookie = await logar(fixture.nomeUsuario, "senhadocorretor789");
      return { ...fixture, cookie };
    }

    it("bloqueia criação com publicar_grupo_olx=true sem CEP", async () => {
      const corretor = await corretorAprovadoLogado();
      const taxonomiaResp = await chamar("/api/painel-corretor/taxonomia", { headers: { cookie: corretor.cookie } });
      const taxonomia = (await taxonomiaResp.json()) as {
        cidades: { id: number }[];
      };

      const resposta = await chamar("/api/anuncios", {
        method: "POST",
        headers: { cookie: corretor.cookie, "content-type": "application/json" },
        body: JSON.stringify({
          titulo: "Anúncio sem CEP",
          tipo_negocio_id: 1,
          categoria_imovel_id: 1,
          tipo_imovel_id: 1,
          cidade_id: taxonomia.cidades[0].id,
          preco_venda: 100000,
          publicar_grupo_olx: true,
        }),
      });
      expect(resposta.status).toBe(400);
    });

    it("cria (201), edita (200, slug final != provisório) e exclui (soft-delete) um anúncio real", async () => {
      const corretor = await corretorAprovadoLogado();
      const taxonomiaResp = await chamar("/api/painel-corretor/taxonomia", { headers: { cookie: corretor.cookie } });
      const taxonomia = (await taxonomiaResp.json()) as {
        cidades: { id: number }[];
      };
      const cidadeId = taxonomia.cidades[0].id;

      const criarResp = await chamar("/api/anuncios", {
        method: "POST",
        headers: { cookie: corretor.cookie, "content-type": "application/json" },
        body: JSON.stringify({
          titulo: "Casa de teste do funil completo",
          tipo_negocio_id: 1,
          categoria_imovel_id: 1,
          tipo_imovel_id: 3, // Casa (seção 5.3) — mesmo id usado na validação manual da PR #59
          cidade_id: cidadeId,
          preco_venda: 350000,
          area_util: 120,
          quartos: 3,
          banheiros: 2,
          cep: "86180-000",
          publicar_grupo_olx: true,
          postar_na_rede: true,
        }),
      });
      expect(criarResp.status).toBe(201);
      const criado = (await criarResp.json()) as { anuncio: { id: number; slug: string } };
      const anuncioId = criado.anuncio.id;

      // Regressão travada: atualizarAnuncio não tinha "slug" na whitelist —
      // o slug provisório ("-0") nunca era substituído pelo final ("-{id}").
      expect(criado.anuncio.slug.endsWith("-0")).toBe(false);
      expect(criado.anuncio.slug.endsWith(`-${anuncioId}`)).toBe(true);

      const editarResp = await chamar(`/api/anuncios/${anuncioId}`, {
        method: "PUT",
        headers: { cookie: corretor.cookie, "content-type": "application/json" },
        body: JSON.stringify({
          titulo: "Casa de teste — editada",
          tipo_negocio_id: 1,
          categoria_imovel_id: 1,
          tipo_imovel_id: 3,
          cidade_id: cidadeId,
          preco_venda: 399000,
          area_util: 120,
          quartos: 3,
          banheiros: 2,
          cep: "86180-000",
          publicar_grupo_olx: true,
          postar_na_rede: true,
        }),
      });
      expect(editarResp.status).toBe(200);

      const deletarResp = await chamar(`/api/anuncios/${anuncioId}`, {
        method: "DELETE",
        headers: { cookie: corretor.cookie },
      });
      expect(deletarResp.status).toBe(200);

      const listagemResp = await chamar("/api/painel-corretor/anuncios?pagina=1", {
        headers: { cookie: corretor.cookie },
      });
      const listagem = (await listagemResp.json()) as { anuncios: { id: number; vendido_removido: number }[] };
      const item = listagem.anuncios.find((a) => a.id === anuncioId);
      expect(item?.vendido_removido).toBe(1);
    });
  });

  // ============================================================
  // 5. Geração em lote — cidade_id na mensagem + JSONs no R2
  // ============================================================
  describe("5. Geração em lote (revalidação cruzada + R2)", () => {
    it("enfileira revalidacao-cruzada com cidade_id (não só cidade_slug) e materializa os JSONs no R2", async () => {
      const fixture = await seedPreCadastro({ senha: "senhalote123" });
      await chamar(`/api/painel-admin/pre-cadastro/${fixture.preCadastroId}/aprovar`, {
        method: "POST",
        headers: { cookie: cookieSuperadmin, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const cookie = await logar(fixture.nomeUsuario, "senhalote123");

      const cidade = await buscarUmaCidade();

      const mensagensEnfileiradas: Record<string, unknown>[] = [];
      const espiao = vi.spyOn(env.FILA_ALTERACOES, "send").mockImplementation(async (msg: unknown) => {
        mensagensEnfileiradas.push(msg as Record<string, unknown>);
      });

      const criarResp = await chamar("/api/anuncios", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          titulo: "Anúncio pra geração em lote",
          tipo_negocio_id: 1,
          categoria_imovel_id: 1,
          tipo_imovel_id: 1,
          cidade_id: cidade.id,
          preco_venda: 200000,
          quartos: 2,
          banheiros: 1,
          area_util: 60,
          postar_na_rede: true,
        }),
      });
      expect(criarResp.status).toBe(201);
      const criado = (await criarResp.json()) as { anuncio: { id: number } };

      espiao.mockRestore();

      // Regressão travada: a mensagem de revalidação cruzada só levava
      // cidade_slug — gerar-json-cidade.ts precisa de cidade_id pra
      // consultar `WHERE a.cidade_id = ?`, e o job quebrava com
      // D1_TYPE_ERROR silenciosamente.
      const mensagemRevalidacao = mensagensEnfileiradas.find((m) => m.tipo === "revalidacao-cruzada");
      expect(mensagemRevalidacao).toBeDefined();
      expect(mensagemRevalidacao?.cidade_id).toBe(cidade.id);
      expect(mensagemRevalidacao?.anuncio_id).toBe(criado.anuncio.id);

      // Materializa os JSONs de verdade (bypassando o transporte da Queue,
      // testando os jobs diretamente — mesma abordagem já usada na
      // validação manual da PR #56/#59) e confirma que refletem a mudança.
      await processarGerarJsonCidade({ tipo: "gerar-json-cidade", cidade_id: cidade.id, cidade_slug: cidade.slug }, env as any);
      await processarGerarJsonCorretor({ tipo: "gerar-json-corretor", corretor_slug: fixture.slug }, env as any);

      const jsonCidade = await env.DADOS_CACHE.get(`cidades/${cidade.slug}.json`);
      expect(jsonCidade).not.toBeNull();
      const anunciosCidade = (await jsonCidade!.json()) as { id: number }[];
      expect(anunciosCidade.some((a) => a.id === criado.anuncio.id)).toBe(true);

      const jsonCorretor = await env.DADOS_CACHE.get(`corretores/${fixture.slug}.json`);
      expect(jsonCorretor).not.toBeNull();
    });
  });

  // ============================================================
  // 6. Troca de plano — bloqueia downgrade que excede limites reais
  // ============================================================
  describe("6. Troca de plano", () => {
    it("bloqueia downgrade quando um anúncio excede max_fotos_por_anuncio do plano novo (não usa preço como proxy)", async () => {
      const fixture = await seedPreCadastro({ senha: "senhaplano123" });
      await chamar(`/api/painel-admin/pre-cadastro/${fixture.preCadastroId}/aprovar`, {
        method: "POST",
        headers: { cookie: cookieSuperadmin, "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const plano1 = await buscarIdPlano("Plano 1"); // max_fotos_por_anuncio = 10
      const plano2 = await buscarIdPlano("Plano 2"); // max_fotos_por_anuncio = 15
      await env.DB.prepare("UPDATE corretores SET plano_id = ? WHERE id = ?").bind(plano2, fixture.corretorId).run();

      const cidade = await buscarUmaCidade();
      const agora = new Date().toISOString();
      const onzeFotos = JSON.stringify(Array.from({ length: 11 }, (_, i) => `fotos/${i}.webp`));
      await env.DB.prepare(
        `INSERT INTO anuncios (corretor_id, titulo, tipo_negocio_id, categoria_imovel_id, tipo_imovel_id, cidade_id, fotos_json, slug, criado_em, atualizado_em)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
        .bind(fixture.corretorId, "Anúncio com 11 fotos", 1, 1, 1, cidade.id, onzeFotos, `anuncio-11-fotos-${fixture.corretorId}`, agora, agora)
        .run();

      // Downgrade bloqueado: 11 fotos excedem o limite de 10 do Plano 1 —
      // a checagem compara max_fotos_por_anuncio direto, não preço
      // (bug real: plano mais caro com limite menor passava sem checagem).
      const bloqueado = await trocarPlanoDoCorretor(env.DB, fixture.corretorId, plano1);
      expect(bloqueado.permitido).toBe(false);
      expect(bloqueado.mensagem).toMatch(/fotos/i);

      const corretorAposBloqueio = (await env.DB.prepare("SELECT plano_id FROM corretores WHERE id = ?")
        .bind(fixture.corretorId)
        .first()) as { plano_id: number };
      expect(corretorAposBloqueio.plano_id).toBe(plano2);

      // Upgrade sempre permitido, mesmo corretor, mesmo estado.
      const plano3 = await buscarIdPlano("Plano 3");
      const permitido = await trocarPlanoDoCorretor(env.DB, fixture.corretorId, plano3);
      expect(permitido.permitido).toBe(true);
    });
  });

  // ============================================================
  // 7. PWA — checagem viva antes de servir artefato cacheado no R2
  // ============================================================
  describe("7. Módulo PWA", () => {
    it("nega /manifest.json, /sw.js e mostra 'não disponível' em /apps após downgrade, mesmo com artefato antigo no R2", async () => {
      const fixture = await seedPreCadastro({ senha: "senhapwa123" });
      await chamar(`/api/painel-admin/pre-cadastro/${fixture.preCadastroId}/aprovar`, {
        method: "POST",
        headers: { cookie: cookieSuperadmin, "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const plano2 = await buscarIdPlano("Plano 2"); // permite_pwa = 1
      const plano1 = await buscarIdPlano("Plano 1"); // permite_pwa = 0
      await env.DB.prepare("UPDATE corretores SET plano_id = ? WHERE id = ?").bind(plano2, fixture.corretorId).run();

      await sincronizarArtefatosPwaDoCorretor(env as any, fixture.slug);

      const manifestElegivel = await chamar("/manifest.json", { host: `${fixture.slug}.imobiliarista.net` });
      expect(manifestElegivel.status).toBe(200);

      // Downgrade — 0 anúncios ativos, sempre permitido.
      const resultado = await trocarPlanoDoCorretor(env.DB, fixture.corretorId, plano1);
      expect(resultado.permitido).toBe(true);

      // Simula a "próxima regeneração em lote" que materializa a
      // elegibilidade real — artefato antigo (manifest/sw elegível) já
      // está no R2 de antes do downgrade.
      await sincronizarArtefatosPwaDoCorretor(env as any, fixture.slug);

      const manifestNegado = await chamar("/manifest.json", { host: `${fixture.slug}.imobiliarista.net` });
      expect(manifestNegado.status).toBe(404);

      const swNegado = await chamar("/sw.js", { host: `${fixture.slug}.imobiliarista.net` });
      expect(swNegado.status).toBe(404);

      const appsResp = await chamar("/apps", { host: `${fixture.slug}.imobiliarista.net` });
      expect(appsResp.status).toBe(200);
      const corpo = await appsResp.text();
      expect(corpo).toContain("não disponível");
    });
  });

  // ============================================================
  // 8. Publicações — opt-in feed próprio vs. Feed Padrão da Rede
  // ============================================================
  describe("8. Módulo Publicações", () => {
    it("reflete feed próprio e Feed Padrão da Rede no JSON do corretor", async () => {
      await env.DB.prepare("UPDATE modulos_ativos SET ativo = 1 WHERE slug = 'publicacoes'").run();

      const fixture = await seedPreCadastro({ senha: "senhapub123" });
      await chamar(`/api/painel-admin/pre-cadastro/${fixture.preCadastroId}/aprovar`, {
        method: "POST",
        headers: { cookie: cookieSuperadmin, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const plano2 = await buscarIdPlano("Plano 2"); // permite_publicacoes = 1
      await env.DB.prepare("UPDATE corretores SET plano_id = ? WHERE id = ?").bind(plano2, fixture.corretorId).run();
      const cookie = await logar(fixture.nomeUsuario, "senhapub123");

      const feedProprio = "https://blog-do-corretor-teste.blogspot.com/feeds/posts/default";
      const salvarProprio = await chamar("/api/painel-corretor/publicacoes", {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ ativo: true, usarFeedPadrao: false, feedUrl: feedProprio }),
      });
      expect(salvarProprio.status).toBe(200);

      await processarGerarJsonCorretor({ tipo: "gerar-json-corretor", corretor_slug: fixture.slug }, env as any);
      const jsonComFeedProprio = (await (await env.DADOS_CACHE.get(`corretores/${fixture.slug}.json`))!.json()) as {
        _index?: unknown;
      } & Record<string, any>;
      // gerar-json-corretor.ts grava o índice em corretores/{slug}.json —
      // o bloco `publicacoes` fica no nível raiz do objeto (ver seção 4.19).
      expect(jsonComFeedProprio.publicacoes?.feedUrl).toBe(feedProprio);

      const salvarPadrao = await chamar("/api/painel-corretor/publicacoes", {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ ativo: true, usarFeedPadrao: true }),
      });
      expect(salvarPadrao.status).toBe(200);

      await processarGerarJsonCorretor({ tipo: "gerar-json-corretor", corretor_slug: fixture.slug }, env as any);
      const jsonComFeedPadrao = (await (await env.DADOS_CACHE.get(`corretores/${fixture.slug}.json`))!.json()) as Record<
        string,
        any
      >;
      expect(jsonComFeedPadrao.publicacoes?.feedUrl).toBe(env.FEED_PADRAO_REDE_URL);
    });
  });

  // ============================================================
  // 9. Backup e exportação
  // ============================================================
  describe("9. Backup e restauração", () => {
    it("gera backup no schema próprio e rejeita restauração que ultrapassa o limite do plano atual", async () => {
      const fixture = await seedPreCadastro({ senha: "senhabackup123" });
      await chamar(`/api/painel-admin/pre-cadastro/${fixture.preCadastroId}/aprovar`, {
        method: "POST",
        headers: { cookie: cookieSuperadmin, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const cookie = await logar(fixture.nomeUsuario, "senhabackup123");
      const cidade = await buscarUmaCidade();

      const criarResp = await chamar("/api/anuncios", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          titulo: "Anúncio original do backup",
          tipo_negocio_id: 1,
          categoria_imovel_id: 1,
          tipo_imovel_id: 1,
          cidade_id: cidade.id,
          preco_venda: 150000,
          quartos: 2,
          banheiros: 1,
          area_util: 55,
          postar_na_rede: true,
        }),
      });
      expect(criarResp.status).toBe(201);

      const backupResp = await chamar("/api/anuncios/backup", { headers: { cookie } });
      expect(backupResp.status).toBe(200);
      const backup = (await backupResp.json()) as { versao_schema: string; anuncios: { id: number }[] };
      expect(backup.versao_schema).toBeTruthy();
      expect(backup.anuncios.length).toBeGreaterThanOrEqual(1);

      // Plano dedicado com max_anuncios=1 pra forçar o corretor (que já
      // tem 1 anúncio ativo) a exceder o limite com qualquer restauração nova.
      const planoRestrito = await env.DB.prepare(
        `INSERT INTO planos (nome, max_anuncios, max_fotos_por_anuncio, taxa_adesao, preco_mensalidade, permite_pwa, permite_publicacoes, permite_api_google_maps, ativo)
         VALUES (?,1,5,0,0,0,0,0,1)`
      )
        .bind(`Plano Restrito Teste ${fixture.corretorId}`)
        .run();
      const planoRestritoId = planoRestrito.meta.last_row_id as number;
      await env.DB.prepare("UPDATE corretores SET plano_id = ? WHERE id = ?").bind(planoRestritoId, fixture.corretorId).run();

      const idFake = 900000 + fixture.corretorId;
      const restaurarBloqueado = await chamar("/api/anuncios/restaurar", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          anuncios: [
            {
              id: idFake,
              corretor_id: fixture.corretorId,
              titulo: "Anúncio restaurado além do limite",
              tipo_negocio_id: 1,
              categoria_imovel_id: 1,
              tipo_imovel_id: 1,
              cidade_id: cidade.id,
              slug: `anuncio-restaurado-${idFake}`,
              vendido_removido: false,
            },
          ],
        }),
      });
      expect(restaurarBloqueado.status).toBe(409);

      const { total } = (await env.DB.prepare("SELECT COUNT(*) as total FROM anuncios WHERE id = ?")
        .bind(idFake)
        .first()) as { total: number };
      expect(total).toBe(0);

      // Plano com espaço de sobra — a mesma restauração deve passar.
      const plano2 = await buscarIdPlano("Plano 2");
      await env.DB.prepare("UPDATE corretores SET plano_id = ? WHERE id = ?").bind(plano2, fixture.corretorId).run();

      const restaurarPermitido = await chamar("/api/anuncios/restaurar", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          anuncios: [
            {
              id: idFake,
              corretor_id: fixture.corretorId,
              titulo: "Anúncio restaurado dentro do limite",
              tipo_negocio_id: 1,
              categoria_imovel_id: 1,
              tipo_imovel_id: 1,
              cidade_id: cidade.id,
              slug: `anuncio-restaurado-${idFake}`,
              vendido_removido: false,
            },
          ],
        }),
      });
      expect(restaurarPermitido.status).toBe(201);

      const { total: totalDepois } = (await env.DB.prepare("SELECT COUNT(*) as total FROM anuncios WHERE id = ?")
        .bind(idFake)
        .first()) as { total: number };
      expect(totalDepois).toBe(1);
    });
  });
});
