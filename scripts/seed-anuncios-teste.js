#!/usr/bin/env node
// scripts/seed-anuncios-teste.js
//
// Popula ~10 anúncios de teste em Londrina/PR pra permitir testar
// visualmente busca/filtros/mapa (hoje sem nenhum dado real). Usa um
// corretor aprovado JÁ EXISTENTE (não cria corretor novo) — prioriza
// nome_usuario ARANDA/TESTE, cai pro primeiro corretor aprovado com
// minisite que encontrar.
//
// IMPORTANTE — dependência de schema: este script grava anuncios.latitude/
// anuncios.longitude, colunas que não existiam até a migration
// migrations/0017_anuncios_geolocalizacao.sql (criada junto com este
// script). Sem ela aplicada no D1 remoto (`wrangler d1 execute imob-bd
// --remote --file=./migrations/0017_anuncios_geolocalizacao.sql`), o
// INSERT abaixo falha com "no such column". O job gerar-json-cidade.ts/
// gerar-json-corretor.ts também precisam da versão atualizada (mesmo
// commit) pra propagar latitude/longitude aos JSONs em R2 — sem isso os
// pins do mapa não aparecem mesmo com a coluna preenchida no D1.
//
// Ferramentas usadas, e por quê: mesmo padrão de
// scripts/backfill-json-corretor.js —
//   - `wrangler d1 execute --remote` pra ler taxonomia/corretor/cidade e
//     gravar os INSERTs/UPDATEs.
//   - API HTTP da Cloudflare (fetch direto) só pra publicar nas filas
//     "gerar-json-corretor"/"gerar-json-cidade" — a wrangler CLI instalada
//     aqui não tem `wrangler queues producer send`.
//
// TAREFA MANUAL — este script NÃO deve ser rodado por este ambiente
// (sandbox sem CLOUDFLARE_API_TOKEN e sem `wrangler` autenticado contra a
// conta real; nunca simula um resultado). Quem rodar precisa:
//
//   1. Aplicar migrations/0017_anuncios_geolocalizacao.sql no D1 remoto
//      (se ainda não aplicada).
//   2. `wrangler login` (ou WRANGLER_API_TOKEN) autenticado na conta certa
//      — usado pelo subprocesso `wrangler d1 execute`.
//   3. Exportar CLOUDFLARE_API_TOKEN (permissão "Account > Workers Queues >
//      Edit") e CLOUDFLARE_ACCOUNT_ID — usados só pra publicar na fila.
//
// Uso (sempre rode sem --confirmar primeiro — modo dry-run é o padrão):
//   node scripts/seed-anuncios-teste.js
//   node scripts/seed-anuncios-teste.js --confirmar
//
// Idempotente NÃO — rodar de novo com --confirmar insere outros 10
// registros (títulos iguais, IDs diferentes). Rodar uma vez só.
//
// COMO REMOVER DEPOIS (todo título começa com "[TESTE] " de propósito):
//   wrangler d1 execute imob-bd --remote --command "DELETE FROM anuncios WHERE titulo LIKE '[TESTE]%'"
// Depois do DELETE, reenfileire a geração de JSON do corretor/cidade
// escolhidos (mesmo mecanismo deste script, ou rode este script de novo
// só até a etapa de leitura pra pegar corretor_slug/cidade_slug e publique
// manualmente as duas mensagens) — senão o R2 fica servindo JSON com os
// anúncios de teste já apagados do D1 até a próxima mutação real.

import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const DB = "imob-bd";
const QUEUE_NOME = "imob-queue";
const API_BASE = "https://api.cloudflare.com/client/v4";

const CONFIRMAR = process.argv.includes("--confirmar");

function erroFatal(mensagem) {
  console.error(`❌ ${mensagem}`);
  process.exit(1);
}

function rodarWrangler(args) {
  return execFileSync("wrangler", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

function consultarD1(sql) {
  const saida = rodarWrangler(["d1", "execute", DB, "--remote", "--json", "--command", sql]);
  const resultado = JSON.parse(saida);
  return resultado?.[0]?.results ?? [];
}

function rodarD1Arquivo(sql) {
  const caminho = join(tmpdir(), `seed-anuncios-teste-${randomUUID()}.sql`);
  writeFileSync(caminho, sql, "utf-8");
  try {
    rodarWrangler(["d1", "execute", DB, "--remote", "--file", caminho]);
  } finally {
    unlinkSync(caminho);
  }
}

// Mesma regra de src/lib/slug.ts::gerarSlug — duplicada aqui porque este
// script roda fora do Worker (sem acesso ao bundle TS).
function gerarSlug(titulo, id) {
  const slugBase = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slugBase}-${id}`;
}

// Mesma regra de src/jobs/gerar-json-cidade.ts::slugificar (usada pro
// caminho do arquivo em R2 — precisa bater com o que o job real gera).
function slugificarCidade(nome) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function escaparSql(valor) {
  if (valor === null || valor === undefined) return "NULL";
  if (typeof valor === "number") return String(valor);
  return `'${String(valor).replace(/'/g, "''")}'`;
}

// ============================================================
// DADOS DE TESTE — 10 anúncios espalhados por bairros reais de
// Londrina/PR, com variedade de tipo/categoria/preço/quartos.
// Coordenadas aproximadas (não geocodificação exata) só pra distribuir
// pins visualmente distintos no mapa. Os 2 últimos ficam sem
// latitude/longitude de propósito, pra exercitar o caso "sem coordenada".
// ============================================================
const REGISTROS_TESTE = [
  {
    titulo: "Apartamento 2 quartos Centro",
    tipoNegocio: "venda",
    tipoImovel: "apartamento",
    bairro: "Centro",
    endereco: "Rua Sergipe, 100",
    precoVenda: 320000,
    quartos: 2,
    banheiros: 1,
    areaUtil: 65,
    lat: -23.3103,
    lng: -51.1628,
  },
  {
    titulo: "Casa 3 quartos Gleba Palhano",
    tipoNegocio: "venda",
    tipoImovel: "casa",
    bairro: "Gleba Palhano",
    endereco: "Avenida Higienópolis, 2200",
    precoVenda: 1450000,
    quartos: 3,
    banheiros: 3,
    areaUtil: 220,
    lat: -23.3287,
    lng: -51.1553,
  },
  {
    titulo: "Apartamento 1 quarto Igapó para locação",
    tipoNegocio: "locacao",
    tipoImovel: "apartamento",
    bairro: "Igapó",
    endereco: "Rua Piauí, 450",
    precoAluguel: 1200,
    quartos: 1,
    banheiros: 1,
    areaUtil: 42,
    lat: -23.2775,
    lng: -51.1732,
  },
  {
    titulo: "Terreno Jardim Bandeirantes",
    tipoNegocio: "venda",
    tipoImovel: "terreno",
    bairro: "Jardim Bandeirantes",
    endereco: "Rua das Palmeiras, s/n",
    precoVenda: 150000,
    areaTotal: 300,
    lat: -23.3327,
    lng: -51.2013,
  },
  {
    titulo: "Casa 4 quartos Zona 7",
    tipoNegocio: "venda",
    tipoImovel: "casa",
    bairro: "Zona 7",
    endereco: "Rua Rio de Janeiro, 890",
    precoVenda: 890000,
    quartos: 4,
    banheiros: 3,
    areaUtil: 280,
    lat: -23.296,
    lng: -51.1595,
  },
  {
    titulo: "Apartamento 3 quartos Jardim Shangri-lá para locação",
    tipoNegocio: "locacao",
    tipoImovel: "apartamento",
    bairro: "Jardim Shangri-lá",
    endereco: "Avenida Winston Churchill, 500",
    precoAluguel: 3500,
    quartos: 3,
    banheiros: 2,
    areaUtil: 110,
    lat: -23.295,
    lng: -51.1875,
  },
  {
    titulo: "Casa 2 quartos Vila Ipiranga",
    tipoNegocio: "venda",
    tipoImovel: "casa",
    bairro: "Vila Ipiranga",
    endereco: "Rua Belo Horizonte, 320",
    precoVenda: 480000,
    quartos: 2,
    banheiros: 2,
    areaUtil: 130,
    lat: -23.2864,
    lng: -51.1478,
  },
  {
    titulo: "Apartamento 4 quartos Gleba Palhano alto padrão",
    tipoNegocio: "venda",
    tipoImovel: "apartamento",
    bairro: "Gleba Palhano",
    endereco: "Avenida Madre Leônia Milito, 1100",
    precoVenda: 1500000,
    quartos: 4,
    banheiros: 4,
    areaUtil: 210,
    lat: -23.326,
    lng: -51.159,
  },
  {
    // Sem coordenada de propósito — caso "imóvel sem coordenada" (ver
    // public/assets/js/mapa.js: initListingMap/initDetailMap ignoram o
    // pin quando falta latitude/longitude).
    titulo: "Apartamento 1 quarto Jardim California para locação",
    tipoNegocio: "locacao",
    tipoImovel: "apartamento",
    bairro: "Jardim Califórnia",
    endereco: "Rua Paranaguá, 210",
    precoAluguel: 950,
    quartos: 1,
    banheiros: 1,
    areaUtil: 38,
    lat: null,
    lng: null,
  },
  {
    // Sem coordenada de propósito — mesmo caso do item anterior.
    titulo: "Casa 3 quartos Aeroporto",
    tipoNegocio: "venda",
    tipoImovel: "casa",
    bairro: "Aeroporto",
    endereco: "Rua Antônio Ferreira Pinto, 75",
    precoVenda: 380000,
    quartos: 3,
    banheiros: 2,
    areaUtil: 150,
    lat: null,
    lng: null,
  },
];

const DESCRICAO_PADRAO =
  "[TESTE] Anúncio de teste gerado por scripts/seed-anuncios-teste.js — não é um imóvel real.";

function buscarCidadeLondrina() {
  const linhas = consultarD1("SELECT id, nome FROM cidades WHERE nome = 'Londrina' AND uf = 'PR' LIMIT 1");
  if (linhas.length === 0) {
    erroFatal(
      "Cidade 'Londrina' (UF 'PR') não encontrada em `cidades`. Confira migrations/0003_cidades_ibge.sql — este script não inventa cidade_id.",
    );
  }
  return linhas[0];
}

function buscarCorretorAprovado() {
  const linhas = consultarD1(
    `SELECT c.id AS corretor_id, c.nome_usuario, m.slug AS minisite_slug
     FROM corretores c
     JOIN minisites m ON m.corretor_id = c.id
     WHERE c.status = 'aprovado'
     ORDER BY CASE WHEN UPPER(c.nome_usuario) IN ('ARANDA', 'TESTE') THEN 0 ELSE 1 END, c.id
     LIMIT 1`,
  );
  if (linhas.length === 0) {
    erroFatal(
      "Nenhum corretor aprovado com minisite encontrado. Este script NÃO cria corretor novo — aprove um corretor (ex.: rodando scripts/db-seed/seed-superadmin-teste.sql) antes de rodar de novo.",
    );
  }
  return linhas[0];
}

function buscarTaxonomia() {
  const negocios = consultarD1("SELECT id, slug FROM tipos_negocio WHERE slug IN ('venda', 'locacao')");
  const categoriaResidencial = consultarD1("SELECT id FROM categorias_imovel WHERE slug = 'residencial' LIMIT 1");

  if (categoriaResidencial.length === 0) {
    erroFatal("Categoria 'residencial' não encontrada em `categorias_imovel`. Confira migrations/0002_taxonomia.sql.");
  }

  const categoriaId = categoriaResidencial[0].id;
  const tipos = consultarD1(
    `SELECT id, slug FROM tipos_imovel WHERE categoria_id = ${categoriaId} AND slug IN ('apartamento', 'casa', 'terreno')`,
  );

  const negocioPorSlug = Object.fromEntries(negocios.map((n) => [n.slug, n.id]));
  const tipoPorSlug = Object.fromEntries(tipos.map((t) => [t.slug, t.id]));

  for (const slug of ["venda", "locacao"]) {
    if (!negocioPorSlug[slug]) erroFatal(`tipo_negocio '${slug}' não encontrado em tipos_negocio.`);
  }
  for (const slug of ["apartamento", "casa", "terreno"]) {
    if (!tipoPorSlug[slug]) erroFatal(`tipo_imovel '${slug}' (categoria residencial) não encontrado em tipos_imovel.`);
  }

  return { categoriaId, negocioPorSlug, tipoPorSlug };
}

function montarInsert(registro, corretorId, cidadeId, taxonomia) {
  const colunas = [
    "corretor_id",
    "titulo",
    "descricao",
    "preco_venda",
    "preco_aluguel",
    "tipo_negocio_id",
    "categoria_imovel_id",
    "tipo_imovel_id",
    "cidade_id",
    "bairro",
    "endereco_completo",
    "exibir_endereco_completo",
    "area_total",
    "area_util",
    "quartos",
    "banheiros",
    "postar_na_rede",
    "vendido_removido",
    "publicar_grupo_olx",
    "slug",
    "latitude",
    "longitude",
    "criado_em",
    "atualizado_em",
  ];

  const tituloCompleto = `[TESTE] ${registro.titulo}`;
  const valores = [
    corretorId,
    tituloCompleto,
    DESCRICAO_PADRAO,
    registro.precoVenda ?? null,
    registro.precoAluguel ?? null,
    taxonomia.negocioPorSlug[registro.tipoNegocio],
    taxonomia.categoriaId,
    taxonomia.tipoPorSlug[registro.tipoImovel],
    cidadeId,
    registro.bairro,
    registro.endereco ?? null,
    0,
    registro.areaTotal ?? null,
    registro.areaUtil ?? null,
    registro.quartos ?? null,
    registro.banheiros ?? null,
    1, // postar_na_rede — visível na busca
    0, // vendido_removido
    0, // publicar_grupo_olx
    "teste-temp", // placeholder — substituído por UPDATE após o INSERT (mesmo padrão de routes/api-anuncios-crud.ts: slug real depende do id)
    registro.lat ?? null,
    registro.lng ?? null,
    "datetime('now')",
    "datetime('now')",
  ];

  const valoresSql = valores.map((v) => (v === "datetime('now')" ? v : escaparSql(v)));
  return `INSERT INTO anuncios (${colunas.join(", ")}) VALUES (${valoresSql.join(", ")});`;
}

function formatarPreco(registro) {
  if (registro.precoVenda) return `R$ ${registro.precoVenda.toLocaleString("pt-BR")} (venda)`;
  if (registro.precoAluguel) return `R$ ${registro.precoAluguel.toLocaleString("pt-BR")}/mês (locação)`;
  return "—";
}

async function chamarApiCloudflare(caminho, token, init) {
  const resposta = await fetch(`${API_BASE}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const corpo = await resposta.json();

  if (!resposta.ok || corpo.success === false) {
    const detalhe = JSON.stringify(corpo.errors ?? corpo);
    throw new Error(`Chamada à API Cloudflare falhou (${resposta.status}) em ${caminho}: ${detalhe}`);
  }

  return corpo.result;
}

async function resolverIdDaFila(accountId, token) {
  const filas = await chamarApiCloudflare(`/accounts/${accountId}/queues`, token);
  const fila = (filas ?? []).find((f) => f.queue_name === QUEUE_NOME || f.name === QUEUE_NOME);

  if (!fila) {
    erroFatal(`Fila "${QUEUE_NOME}" não encontrada na conta ${accountId}. Confira CLOUDFLARE_ACCOUNT_ID.`);
  }

  return fila.queue_id ?? fila.id;
}

async function enfileirar(accountId, token, queueId, corpo) {
  await chamarApiCloudflare(`/accounts/${accountId}/queues/${queueId}/messages`, token, {
    method: "POST",
    body: JSON.stringify({ body: corpo, content_type: "json" }),
  });
}

async function main() {
  console.log(`Modo: ${CONFIRMAR ? "EXECUÇÃO (vai inserir de verdade e enfileirar)" : "DRY-RUN (só mostra, não grava — use --confirmar pra aplicar)"}`);

  console.log(`\nLendo cidade Londrina/PR em ${DB} (--remote)...`);
  const cidade = buscarCidadeLondrina();
  console.log(`  cidade_id = ${cidade.id} (${cidade.nome})`);

  console.log(`\nEscolhendo corretor aprovado dono dos anúncios de teste...`);
  const corretor = buscarCorretorAprovado();
  console.log(`  corretor_id = ${corretor.corretor_id} (nome_usuario=${corretor.nome_usuario ?? "—"}, minisite=${corretor.minisite_slug})`);

  console.log(`\nLendo taxonomia (tipos_negocio / categorias_imovel / tipos_imovel)...`);
  const taxonomia = buscarTaxonomia();

  const cidadeSlug = slugificarCidade(cidade.nome);

  console.log(`\n${REGISTROS_TESTE.length} anúncio(s) de teste planejado(s):\n`);
  for (const registro of REGISTROS_TESTE) {
    const coord = registro.lat && registro.lng ? `${registro.lat}, ${registro.lng}` : "SEM coordenada";
    console.log(
      `  [TESTE] ${registro.titulo}\n` +
        `    preço: ${formatarPreco(registro)} | bairro: ${registro.bairro} | coord: ${coord}\n` +
        `    corretor: ${corretor.minisite_slug} (id ${corretor.corretor_id})\n`,
    );
  }

  if (!CONFIRMAR) {
    console.log("Dry-run — nada foi gravado. Rode de novo com --confirmar pra inserir e enfileirar de verdade.");
    return;
  }

  console.log("\nInserindo os 10 anúncios de teste...");
  const sqlInserts = REGISTROS_TESTE.map((r) => montarInsert(r, corretor.corretor_id, cidade.id, taxonomia)).join(
    "\n",
  );
  rodarD1Arquivo(sqlInserts);
  console.log("  ✓ inseridos (slug ainda temporário)");

  console.log("\nResolvendo IDs reais pra corrigir o slug (mesmo padrão de routes/api-anuncios-crud.ts)...");
  const inseridos = consultarD1(
    `SELECT id, titulo FROM anuncios WHERE corretor_id = ${corretor.corretor_id} AND slug = 'teste-temp' ORDER BY id DESC LIMIT ${REGISTROS_TESTE.length}`,
  );

  if (inseridos.length !== REGISTROS_TESTE.length) {
    erroFatal(
      `Esperava encontrar ${REGISTROS_TESTE.length} anúncio(s) recém-inseridos com slug='teste-temp', achei ${inseridos.length}. Confira manualmente antes de rodar de novo (não repita o INSERT).`,
    );
  }

  const sqlUpdates = inseridos
    .map((a) => `UPDATE anuncios SET slug = ${escaparSql(gerarSlug(a.titulo, a.id))} WHERE id = ${a.id};`)
    .join("\n");
  rodarD1Arquivo(sqlUpdates);
  console.log(`  ✓ slug definitivo aplicado em ${inseridos.length} anúncio(s)`);

  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    erroFatal(
      "Anúncios inseridos, mas CLOUDFLARE_API_TOKEN e/ou CLOUDFLARE_ACCOUNT_ID não configurados — não dá pra enfileirar gerar-json-corretor/gerar-json-cidade. Publique manualmente essas duas mensagens na fila \"imob-queue\" antes de testar (senão os anúncios ficam no D1 mas não aparecem na busca, que lê só do R2 pré-gerado).",
    );
  }

  console.log(`\nResolvendo ID da fila "${QUEUE_NOME}"...`);
  const queueId = await resolverIdDaFila(accountId, token);

  console.log("\nEnfileirando regeneração dos artefatos derivados...");
  await enfileirar(accountId, token, queueId, { tipo: "gerar-json-corretor", corretor_slug: corretor.minisite_slug });
  console.log(`  → enfileirado: gerar-json-corretor (${corretor.minisite_slug})`);
  await enfileirar(accountId, token, queueId, { tipo: "gerar-json-cidade", cidade_id: cidade.id, cidade_slug: cidadeSlug });
  console.log(`  → enfileirado: gerar-json-cidade (${cidadeSlug})`);

  console.log(
    "\n✅ 10 anúncios de teste inseridos e enfileirados. O consumer real (src/queue.ts) processa em instantes — depois disso a busca/mapa devem mostrar os anúncios prefixados \"[TESTE]\".",
  );
  console.log(
    "\nPra remover depois: wrangler d1 execute imob-bd --remote --command \"DELETE FROM anuncios WHERE titulo LIKE '[TESTE]%'\" — e reenfileire gerar-json-corretor/gerar-json-cidade pros mesmos slugs acima (ver comentário no topo deste arquivo).",
  );
}

main().catch((erro) => erroFatal(erro.stack ?? String(erro)));
