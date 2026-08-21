// Bug real reportado em produção: https://imobiliarista.net/londrina mostrava
// "0 imóvel(is) encontrado(s)" mesmo com https://dados.imobiliarista.net/
// cidades/londrina.json respondendo 200 com os 10 anúncios de teste da PR
// #76 — Console acusava 404 em "...ina/londrina.json".
//
// Causa raiz: public/assets/js/app-dados.js::fetchCityListings() lia o
// índice (`cidades/{slug}/_index.json`, formato real gravado por
// jobs/gerar-json-cidade.ts::IndiceCidade — total_anuncios/particoes.arquivos)
// mas então assumia um campo `index.files` que NUNCA existiu nesse schema, e
// no fallback (sem partição) montava `cidades/{slug}/{slug}.json` —
// prefixando o slug da cidade de novo. O job, pra cidade sem partição,
// grava o arquivo PLANO em `cidades/{slug}.json` (seção 4.4.1/4.4.2 do
// project.md, exemplo explícito: "`/cidades/londrina.json` (sem
// partição)") — nunca dentro de uma subpasta `cidades/{slug}/`. Resultado:
// pra qualquer cidade sem partição (o caso comum), o front-end pedia
// `cidades/londrina/londrina.json`, que nunca existiu → 404 → lista vazia.
//
// Este teste prova a correção fazendo o caminho completo: regenera o JSON
// de Londrina pela mesma rota da PR #76 (processarGerarJsonCidade), depois
// executa o `fetchCityListings` REAL (fonte de public/assets/js/app-dados.js,
// carregado via `?raw` e avaliado — não uma reimplementação) contra o mesmo
// bypass de R2 público (dados.imobiliarista.net) que o navegador usa, e
// confirma que os 10 anúncios batem.
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { hashSenha } from "../src/lib/senha";
import { processarGerarJsonCidade } from "../src/jobs/gerar-json-cidade";
import appDadosSource from "../public/assets/js/app-dados.js?raw";

let contadorCpf = 0;
function digitoVerificador(seq: string, mult: number[]): string {
  let soma = 0;
  for (let i = 0; i < seq.length; i++) soma += Number(seq[i]) * mult[i];
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}
function cpfValido(): string {
  contadorCpf++;
  // Faixa "8" — dedicada a este arquivo (ver comentário equivalente em
  // regenerar-cidade.test.ts).
  const base = String(800000000 + ((contadorCpf * 7919) % 90000000)).padStart(9, "0").slice(-9);
  const d1 = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + d1 + d2;
}

async function seedCorretorAprovado() {
  const cpf = cpfValido();
  const nomeUsuario = `corretorlon${contadorCpf}`;
  const { hash, salt } = await hashSenha("senhaqualquer123");
  const agora = new Date().toISOString();
  const slug = `corretor-londrina-${contadorCpf}`;

  const insertCorretor = await env.DB.prepare(
    `INSERT INTO corretores (
      nome_completo, sexo, data_nascimento, nacionalidade, cpf, creci,
      nome_usuario, senha_hash, senha_salt, endereco_residencial, telefone,
      email, status, criado_em, atualizado_em
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      `Corretor Londrina Teste ${contadorCpf}`,
      "outro",
      "1990-01-01",
      "brasileira",
      cpf,
      `CRECI-LON-${contadorCpf}`,
      nomeUsuario,
      hash,
      salt,
      "Rua de Teste, 100",
      "43999990000",
      `${nomeUsuario}@teste.imobiliarista.net`,
      "aprovado",
      agora,
      agora,
    )
    .run();
  const corretorId = insertCorretor.meta.last_row_id as number;

  await env.DB.prepare(
    `INSERT INTO minisites (corretor_id, slug, offline, criado_em, atualizado_em) VALUES (?,?,0,?,?)`,
  )
    .bind(corretorId, slug, agora, agora)
    .run();

  return corretorId;
}

async function buscarLondrina(): Promise<{ id: number; slug: string }> {
  const row = (await env.DB.prepare("SELECT id FROM cidades WHERE nome = 'Londrina'").first()) as
    | { id: number }
    | null;
  if (!row) throw new Error("Londrina não está no catálogo IBGE (migration 0003)");
  return { id: row.id, slug: "londrina" };
}

async function inserirAnuncioTeste(corretorId: number, cidadeId: number, i: number) {
  const agora = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO anuncios (
      corretor_id, titulo, tipo_negocio_id, categoria_imovel_id, tipo_imovel_id,
      cidade_id, preco_venda, postar_na_rede, vendido_removido, slug, criado_em, atualizado_em
    ) VALUES (?,?,1,1,1,?,?,1,0,?,?,?)`,
  )
    .bind(
      corretorId,
      `[TESTE] Anúncio Londrina ${i}`,
      cidadeId,
      300000 + i * 1000,
      `teste-londrina-${contadorCpf}-${i}`,
      agora,
      agora,
    )
    .run();
}

// Carrega o fetchCityListings() REAL do arquivo de produção (não uma cópia)
// via `new Function` — mesma técnica de rodar um <script> clássico (sem
// import/export) fora do navegador, resolvendo `fetch`/`CONFIG`/`appState`
// como globais, exatamente como o browser faz.
function carregarFetchCityListings(): (slug: string) => Promise<void> {
  const fabrica = new Function(`
    ${appDadosSource}
    return fetchCityListings;
  `);
  return fabrica() as (slug: string) => Promise<void>;
}

describe("front-end: fetchCityListings() (app-dados.js) bate com o JSON real gerado em R2", () => {
  it("depois de regenerar cidades/londrina.json, o fetch real do front-end encontra os 10 anúncios de teste", async () => {
    const corretorId = await seedCorretorAprovado();
    const londrina = await buscarLondrina();

    for (let i = 1; i <= 10; i++) {
      await inserirAnuncioTeste(corretorId, londrina.id, i);
    }

    // Mesma lógica de POST /api/painel-admin/regenerar-cidade/:id (PR #76):
    // materializa o job de verdade, sem passar pelo transporte da Queue.
    await processarGerarJsonCidade(
      { tipo: "gerar-json-cidade", cidade_id: londrina.id, cidade_slug: londrina.slug },
      env as any,
    );

    // Confirma a premissa: o arquivo plano existe (sem partição, 10 itens
    // é muito abaixo do limite de particionamento).
    const planoNoR2 = await env.DADOS_CACHE.get(`cidades/${londrina.slug}.json`);
    expect(planoNoR2).not.toBeNull();

    const fetchCityListings = carregarFetchCityListings();

    (globalThis as any).CONFIG = {
      r2DadosUrl: "https://dados.imobiliarista.net",
      cityCache: {},
    };
    (globalThis as any).appState = {};
    const fetchOriginal = globalThis.fetch;
    // O front-end faz fetch(url) contra um hostname absoluto
    // (dados.imobiliarista.net) — aqui redireciona pro mesmo Worker que
    // serve esse bypass em produção (src/index.ts), sem reimplementar nada.
    (globalThis as any).fetch = (url: string, init?: RequestInit) =>
      exports.default.fetch(url, init as RequestInit);

    try {
      await fetchCityListings(londrina.slug);
    } finally {
      globalThis.fetch = fetchOriginal;
    }

    const appState = (globalThis as any).appState;
    expect(appState.allListings).toHaveLength(10);
    const titulos = appState.allListings.map((a: { titulo: string }) => a.titulo).sort();
    for (let i = 1; i <= 10; i++) {
      expect(titulos).toContain(`[TESTE] Anúncio Londrina ${i}`);
    }
  });
});
