// Elegibilidade do módulo Publicações (controle duplo, seção 4.19 do
// project.md), configuração por corretor e leitura do feed do Blogspot.
// Módulo isolado — não depende de rotas do núcleo (routes/minisite.ts),
// duplica localmente a extração de hostname/slug, seguindo o mesmo padrão
// já usado em src/modulos/pwa/logica.ts.
//
// Diferente do PWA, Publicações NUNCA aparece no Portal Principal (4.19)
// — só existe no contexto de um minisite.

import { Env } from "../../index";
import { estaModuloAtivo } from "../../db/queries-modulos";
import { buscarPlano } from "../../db/queries-planos";

export const DOMINIO_RAIZ = "imobiliarista.net";

// URL do Feed Padrão da Rede — nunca hardcoded no meio da lógica (ver 4.19).
// Configurável via variável de ambiente; only fallback abaixo existe para
// nunca deixar o corretor sem feed algum caso a variável não seja definida.
const FEED_PADRAO_REDE_URL_FALLBACK =
  "https://exemplo-substituir.blogspot.com/feeds/posts/default";

export function ehDominioRaiz(hostname: string): boolean {
  return hostname === DOMINIO_RAIZ;
}

export function ehSubdominioMinisite(hostname: string): boolean {
  return hostname.endsWith(`.${DOMINIO_RAIZ}`) && !ehDominioRaiz(hostname);
}

export function extrairSlugMinisite(hostname: string): string | null {
  if (!ehSubdominioMinisite(hostname)) return null;
  const slug = hostname.split(".")[0];
  return slug || null;
}

export function obterFeedPadraoRedeUrl(env: Env): string {
  return env.FEED_PADRAO_REDE_URL || FEED_PADRAO_REDE_URL_FALLBACK;
}

// ============================================================
// Configuração por corretor (corretor.config_modulos.publicacoes)
// ============================================================

export interface ConfigPublicacoes {
  ativo: boolean;
  usarFeedPadrao: boolean;
  feedUrl: string | null;
}

const CONFIG_PADRAO: ConfigPublicacoes = {
  ativo: false,
  usarFeedPadrao: true,
  feedUrl: null,
};

function parseConfigPublicacoes(configModulosJson: string | null | undefined): ConfigPublicacoes {
  if (!configModulosJson) return { ...CONFIG_PADRAO };

  try {
    const configModulos = JSON.parse(configModulosJson);
    const publicacoes = configModulos?.publicacoes;
    if (!publicacoes || typeof publicacoes !== "object") return { ...CONFIG_PADRAO };

    return {
      ativo: !!publicacoes.ativo,
      usarFeedPadrao: publicacoes.usarFeedPadrao !== false,
      feedUrl: typeof publicacoes.feedUrl === "string" && publicacoes.feedUrl ? publicacoes.feedUrl : null,
    };
  } catch {
    return { ...CONFIG_PADRAO };
  }
}

export async function buscarConfigPublicacoesDoCorretor(
  db: D1Database,
  corretor_id: number,
): Promise<ConfigPublicacoes> {
  const resultado = (await db
    .prepare("SELECT config_modulos FROM corretores WHERE id = ? LIMIT 1")
    .bind(corretor_id)
    .first()) as { config_modulos: string | null } | null;

  return parseConfigPublicacoes(resultado?.config_modulos);
}

export interface DadosSalvarConfigPublicacoes {
  ativo: boolean;
  usarFeedPadrao: boolean;
  feedUrl: string | null;
}

// Escolha mutuamente exclusiva (4.19): feed próprio exige URL; Feed Padrão
// da Rede nunca guarda URL própria (mesmo que o corretor já tenha
// preenchido uma antes de alternar).
export function validarConfigPublicacoes(
  dados: DadosSalvarConfigPublicacoes,
): { valido: true } | { valido: false; mensagem: string } {
  if (!dados.usarFeedPadrao) {
    const url = dados.feedUrl?.trim();
    if (!url) {
      return { valido: false, mensagem: "Informe a URL do feed do seu Blogspot." };
    }
    if (!/^https:\/\/.+/i.test(url)) {
      return { valido: false, mensagem: "A URL do feed deve começar com https://." };
    }
  }

  return { valido: true };
}

export async function salvarConfigPublicacoesDoCorretor(
  db: D1Database,
  corretor_id: number,
  dados: DadosSalvarConfigPublicacoes,
): Promise<void> {
  const configValidada: ConfigPublicacoes = {
    ativo: !!dados.ativo,
    usarFeedPadrao: !!dados.usarFeedPadrao,
    feedUrl: dados.usarFeedPadrao ? null : dados.feedUrl?.trim() || null,
  };

  const atual = (await db
    .prepare("SELECT config_modulos FROM corretores WHERE id = ? LIMIT 1")
    .bind(corretor_id)
    .first()) as { config_modulos: string | null } | null;

  let configCompleta: Record<string, unknown> = {};
  if (atual?.config_modulos) {
    try {
      configCompleta = JSON.parse(atual.config_modulos);
    } catch {
      configCompleta = {};
    }
  }
  configCompleta.publicacoes = configValidada;

  await db
    .prepare("UPDATE corretores SET config_modulos = ?, atualizado_em = ? WHERE id = ?")
    .bind(JSON.stringify(configCompleta), new Date().toISOString(), corretor_id)
    .run();
}

// ============================================================
// Elegibilidade (controle duplo — rede + plano + opt-in do corretor)
// ============================================================

export interface ElegibilidadePublicacoes {
  elegivel: boolean;
  encontrado: boolean;
  slug?: string;
  corretorId?: number;
  nomeExibicao?: string;
  config: ConfigPublicacoes;
}

export async function verificarElegibilidadePublicacoes(
  db: D1Database,
  hostname: string,
): Promise<ElegibilidadePublicacoes> {
  // Nunca no Portal Principal (4.19) — só existe no minisite.
  if (ehDominioRaiz(hostname) || !ehSubdominioMinisite(hostname)) {
    return { elegivel: false, encontrado: false, config: { ...CONFIG_PADRAO } };
  }

  const slug = extrairSlugMinisite(hostname);
  if (!slug) {
    return { elegivel: false, encontrado: false, config: { ...CONFIG_PADRAO } };
  }

  const moduloAtivoNaRede = await estaModuloAtivo(db, "publicacoes");
  if (!moduloAtivoNaRede) {
    return { elegivel: false, encontrado: true, slug, config: { ...CONFIG_PADRAO } };
  }

  const resultado = (await db
    .prepare(
      `SELECT c.id, c.nome_completo, c.plano_id, c.config_modulos
       FROM corretores c
       JOIN minisites m ON m.corretor_id = c.id
       WHERE m.slug = ? LIMIT 1`,
    )
    .bind(slug)
    .first()) as { id: number; nome_completo: string; plano_id: number | null; config_modulos: string | null } | null;

  if (!resultado) {
    return { elegivel: false, encontrado: false, slug, config: { ...CONFIG_PADRAO } };
  }

  const plano = resultado.plano_id ? await buscarPlano(db, resultado.plano_id) : null;
  const config = parseConfigPublicacoes(resultado.config_modulos);

  return {
    elegivel: !!plano?.permite_publicacoes && config.ativo,
    encontrado: true,
    slug,
    corretorId: resultado.id,
    nomeExibicao: resultado.nome_completo,
    config,
  };
}

// Resolve a URL efetiva do feed: próprio do corretor ou Feed Padrão da Rede
// (4.19). O corretor pode alternar a qualquer momento sem perder o histórico
// — a URL própria fica salva mesmo quando usarFeedPadrao está ativo.
export function resolverUrlFeed(config: ConfigPublicacoes, feedPadraoRedeUrl: string): string {
  if (!config.usarFeedPadrao && config.feedUrl) return config.feedUrl;
  return feedPadraoRedeUrl;
}

// ============================================================
// Leitura do feed do Blogspot (uso server-side apenas: geração de sitemap
// e renderização de meta tags de SEO do post individual — NUNCA no fluxo
// de leitura do visitante, que é 100% client-side, ver 4.19)
// ============================================================

export interface PostFeed {
  id: string;
  titulo: string;
  resumo: string;
  dataPublicacao: string;
  urlOriginal: string;
}

function normalizarBaseFeed(feedUrl: string): string {
  return feedUrl.replace(/\/+$/, "").split("?")[0];
}

// Extrai o ID numérico do post a partir do id Atom/GData do Blogger
// (formato "tag:blogger.com,1999:blog-XXXX.post-YYYY") — é esse número que
// vira o {id-do-post} da nossa própria rota (path routing, 4.19).
function extrairIdDoPost(idAtom: string): string | null {
  const match = idAtom.match(/\.post-(\d+)$/);
  return match ? match[1] : null;
}

function entradaParaPostFeed(entrada: any): PostFeed | null {
  const idAtom = entrada?.id?.$t;
  if (!idAtom) return null;

  const id = extrairIdDoPost(idAtom);
  if (!id) return null;

  const linkAlternate = (entrada.link || []).find((l: any) => l.rel === "alternate");

  return {
    id,
    titulo: entrada.title?.$t || "Publicação",
    resumo: entrada.summary?.$t || entrada.content?.$t || "",
    dataPublicacao: entrada.published?.$t || entrada.updated?.$t || "",
    urlOriginal: linkAlternate?.href || "",
  };
}

// Busca a lista de posts do feed (formato JSON do GData do Blogger),
// usada só pela geração em lote do sitemap (4.16/4.19) — nunca chamada a
// partir de uma requisição de visitante.
export async function buscarPostsDoFeed(feedUrl: string, maxResultados = 500): Promise<PostFeed[]> {
  const base = normalizarBaseFeed(feedUrl);
  const url = `${base}?alt=json&max-results=${maxResultados}`;

  const resposta = await fetch(url);
  if (!resposta.ok) return [];

  const dados = (await resposta.json()) as any;
  const entradas = dados?.feed?.entry || [];

  return entradas
    .map(entradaParaPostFeed)
    .filter((post: PostFeed | null): post is PostFeed => post !== null);
}

// Busca um post específico pelo ID (usado na renderização de meta tags de
// SEO da rota /publicacoes/{id} — ver src/modulos/publicacoes/rota.ts).
export async function buscarPostPorId(feedUrl: string, postId: string): Promise<PostFeed | null> {
  const base = normalizarBaseFeed(feedUrl);
  const url = `${base}/${postId}?alt=json`;

  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return null;

    const dados = (await resposta.json()) as any;
    const entrada = dados?.entry;
    if (!entrada) return null;

    return entradaParaPostFeed(entrada);
  } catch (erro) {
    console.error(`Erro ao buscar post "${postId}" do feed:`, erro);
    return null;
  }
}
