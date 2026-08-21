// Sitemap dinâmico (Lote 11, seção 4.16) nunca era enfileirado — auditoria
// de 2026-08-20. O código dos jobs (src/jobs/gerar-sitemap.ts) e o consumer
// da fila (src/queue.ts, tipos "gerar-sitemap-portal"/"gerar-sitemap-corretor")
// sempre estiveram corretos, mas nenhum ponto do código jamais enviava essas
// mensagens — caminho morto. Causa raiz confirmada lendo o código (não
// presumida): src/jobs/revalidacao-cruzada.ts monta o array de mensagens da
// Queue (gerar-json-cidade, gerar-json-corretor, gerar-json-anuncio,
// gerar-feed-portal-independente) e nunca incluía as duas mensagens de
// sitemap. Não é falta de cron: a seção 4.16 do project.md já previa "gerado
// no mesmo processo em lote que já gera os JSONs/XMLs" — o mesmo padrão de
// disparo por evento já usado para o resto do lote, não um Cron Trigger (o
// único cron em wrangler.toml é o backup mensal do D1, seção 4.13, sem
// nenhuma relação com sitemap).
//
// Este teste trava: (1) a revalidação cruzada agora enfileira as duas
// mensagens de sitemap junto com o resto do lote; (2) os jobs, chamados
// diretamente (bypassando o transporte da Queue, mesma abordagem de
// funil-completo.test.ts), materializam XML bem formado no R2; (3) as rotas
// públicas (sitemap-index.xml no domínio raiz, sitemap.xml no minisite)
// servem esse conteúdo.
import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { hashSenha } from "../src/lib/senha";
import {
  processarGerarSitemapPortal,
  processarGerarSitemapCorretor,
} from "../src/jobs/gerar-sitemap";
import { processarRevalidacaoCruzada } from "../src/jobs/revalidacao-cruzada";

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

// Faixa de CPF dedicada ("9") — nunca colide com as faixas já usadas em
// funil-completo.test.ts (prefixo derivado de 123456700+) e
// sessao-expiracao.test.ts (prefixo "5") quando os arquivos rodam juntos
// contra a mesma instância de D1.
let contadorCpf = 0;
function digitoVerificador(seq: string, mult: number[]): string {
  let soma = 0;
  for (let i = 0; i < seq.length; i++) soma += Number(seq[i]) * mult[i];
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}
function cpfValido(): string {
  contadorCpf++;
  const base = String(900000000 + ((contadorCpf * 7919) % 90000000)).padStart(9, "0").slice(-9);
  const d1 = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + d1 + d2;
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

async function seedPreCadastro(opts: { senha: string }) {
  const cpf = cpfValido();
  const nomeUsuario = `sitemapcorretor${contadorCpf}`;
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
      `Corretor Sitemap Teste ${contadorCpf}`,
      "outro",
      "1990-01-01",
      "brasileira",
      cpf,
      `CRECI-SITEMAP-${contadorCpf}`,
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
      `Corretor Sitemap Teste ${contadorCpf}`,
      `${nomeUsuario}@teste.imobiliarista.net`,
      "43999990000",
      `CRECI-SITEMAP-${contadorCpf}`,
      agora,
      "1.0.0",
      "pendente",
      agora,
      agora
    )
    .run();
  const preCadastroId = insertPreCadastro.meta.last_row_id as number;

  const slug = `corretor-sitemap-teste-${contadorCpf}`;
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
  const nomeUsuario = `SUPERADMIN_SITEMAP_${contadorCpf}`;
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
      "Superadmin Sitemap Teste",
      cpf,
      `ADMIN-SITEMAP-${contadorCpf}`,
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

describe("Sitemap dinâmico (Lote 11) — gatilho de fila reconectado", () => {
  it("enfileira gerar-sitemap-portal e gerar-sitemap-corretor junto com o resto da revalidação cruzada", async () => {
    const superadmin = await seedSuperadmin();
    const cookieSuperadmin = await logar(superadmin.nomeUsuario, superadmin.senha);

    const fixture = await seedPreCadastro({ senha: "senhasitemap123" });
    await chamar(`/api/painel-admin/pre-cadastro/${fixture.preCadastroId}/aprovar`, {
      method: "POST",
      headers: { cookie: cookieSuperadmin, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const cookie = await logar(fixture.nomeUsuario, "senhasitemap123");
    const cidade = await buscarUmaCidade();

    const mensagensEnfileiradas: Record<string, unknown>[] = [];
    const espiao = vi.spyOn(env.FILA_ALTERACOES, "send").mockImplementation(async (msg: unknown) => {
      mensagensEnfileiradas.push(msg as Record<string, unknown>);
    });

    const criarResp = await chamar("/api/anuncios", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        titulo: "Anúncio pra sitemap dinâmico",
        tipo_negocio_id: 1,
        categoria_imovel_id: 1,
        tipo_imovel_id: 1,
        cidade_id: cidade.id,
        preco_venda: 275000,
        quartos: 2,
        banheiros: 1,
        area_util: 70,
        postar_na_rede: true,
      }),
    });
    expect(criarResp.status).toBe(201);
    const criado = (await criarResp.json()) as { anuncio: { id: number; slug: string } };

    espiao.mockRestore();

    // A rota HTTP só enfileira a mensagem "revalidacao-cruzada" (o fan-out
    // pras mensagens de arquivo individual acontece dentro do consumer da
    // Queue, processarRevalidacaoCruzada — mesma abordagem de
    // "5. Geração em lote" em funil-completo.test.ts, que também só
    // verifica esse envio inicial e chama os jobs de destino diretamente).
    const mensagemRevalidacao = mensagensEnfileiradas.find((m) => m.tipo === "revalidacao-cruzada") as
      | { anuncio_id: number; corretor_id: number; corretor_slug: string; cidade_id: number; cidade_slug: string }
      | undefined;
    expect(mensagemRevalidacao).toBeDefined();

    // Executa o consumer diretamente (bypassando o transporte da Queue) e
    // captura o fan-out real.
    const fanOut: Record<string, unknown>[] = [];
    const espiaoFanOut = vi.spyOn(env.FILA_ALTERACOES, "send").mockImplementation(async (msg: unknown) => {
      fanOut.push(msg as Record<string, unknown>);
    });
    await processarRevalidacaoCruzada(
      { tipo: "revalidacao-cruzada", ...mensagemRevalidacao! },
      env as any
    );
    espiaoFanOut.mockRestore();

    // Regressão travada: antes desta correção, nenhuma mensagem de tipo
    // "gerar-sitemap-portal"/"gerar-sitemap-corretor" era enfileirada por
    // NENHUM ponto do código — o consumer (src/queue.ts) sabia processar
    // essas mensagens, mas elas nunca chegavam.
    const msgPortal = fanOut.find((m) => m.tipo === "gerar-sitemap-portal");
    expect(msgPortal).toBeDefined();

    const msgCorretor = fanOut.find((m) => m.tipo === "gerar-sitemap-corretor");
    expect(msgCorretor).toBeDefined();
    expect(msgCorretor?.corretor_slug).toBe(fixture.slug);
    expect(msgCorretor?.corretor_id).toBe(fixture.corretorId);

    // Materializa de verdade (bypassando o transporte da Queue, mesma
    // abordagem de funil-completo.test.ts) e confirma XML bem formado com
    // pelo menos uma URL do anúncio real recém-criado.
    await processarGerarSitemapPortal({ tipo: "gerar-sitemap-portal" }, env as any);
    await processarGerarSitemapCorretor(
      {
        tipo: "gerar-sitemap-corretor",
        corretor_id: fixture.corretorId,
        corretor_slug: fixture.slug,
        cidade_slug: cidade.slug,
      },
      env as any
    );

    const sitemapCidades = await env.DADOS_CACHE.get("sitemap-cidades.xml");
    expect(sitemapCidades).not.toBeNull();
    const xmlCidades = await sitemapCidades!.text();
    expect(xmlCidades.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xmlCidades).toContain("<urlset");
    expect(xmlCidades).toContain(`imobiliarista.net/${cidade.slug}`);

    const sitemapAnuncios1 = await env.DADOS_CACHE.get("sitemap-anuncios-1.xml");
    expect(sitemapAnuncios1).not.toBeNull();
    const xmlAnuncios = await sitemapAnuncios1!.text();
    expect(xmlAnuncios).toContain(`${criado.anuncio.slug}-${criado.anuncio.id}</loc>`);

    const sitemapMinisite = await env.DADOS_CACHE.get(`sitemaps/minisite-${fixture.slug}.xml`);
    expect(sitemapMinisite).not.toBeNull();
    const xmlMinisite = await sitemapMinisite!.text();
    expect(xmlMinisite.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xmlMinisite).toContain(`${fixture.slug}.imobiliarista.net/${cidade.slug}`);
    expect(xmlMinisite).toContain(`${criado.anuncio.slug}-${criado.anuncio.id}</loc>`);

    // Rotas públicas (seção 4.16) — zero invocação de geração na leitura,
    // só servem o que já foi materializado em R2 acima.
    const respostaIndex = await chamar("/sitemap-index.xml");
    expect(respostaIndex.status).toBe(200);
    expect(respostaIndex.headers.get("content-type")).toContain("application/xml");
    const corpoIndex = await respostaIndex.text();
    expect(corpoIndex).toContain("sitemap-cidades.xml");
    expect(corpoIndex).toContain("sitemap-anuncios-1.xml");

    const respostaMinisite = await chamar("/sitemap.xml", { host: `${fixture.slug}.imobiliarista.net` });
    expect(respostaMinisite.status).toBe(200);
    const corpoMinisite = await respostaMinisite.text();
    expect(corpoMinisite).toContain(`${criado.anuncio.slug}-${criado.anuncio.id}</loc>`);
  });
});
