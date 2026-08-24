// modules/publications/index.js
//
// Módulo publications (§47) — ponto de entrada. §47 só define a forma do
// config no perfil público do corretor (`modules.publications:
// {enabled, feedUrl}`) e manda "consumir feed externo no Browser" — o
// resto (qual link o corretor cola, qual formato de feed, quando a
// descoberta roda) é decisão deste lote, documentada em
// modules/publications/README.md:
//
//   - Fonte é Blogger/Blogspot especificamente, não RSS genérico de
//     qualquer blog/CMS.
//   - O corretor cola o link do BLOG (ex.: https://fulano.blogspot.com),
//     não o link do feed — este módulo descobre o feed Atom a partir
//     desse link.
//   - A descoberta roda UMA VEZ, no painel, ao configurar (não a cada
//     carregamento do minisite): `resolveBloggerFeedUrl` tenta o padrão
//     `{origin}/feeds/posts/default` e, se não bater, cai para
//     autodiscovery via `<link rel="alternate" type="application/atom+xml">`
//     na página do blog. O `feedUrl` já resolvido é o que fica salvo em
//     `modules.publications.feedUrl` (modules/publications/config.js).
//   - O consumo em si (`parseAtomFeed`) roda no minisite, a cada
//     carregamento, 100% client-side — sem rota de Worker, mesma
//     filosofia "preferir client-side" já usada em outros módulos
//     (§44, video-youtube/tour-360).
//
// Parsing de XML é feito com regex, não DOMParser: o projeto não tem
// jsdom nem qualquer dependência de parsing (`package.json` só lista
// `wrangler`), e o padrão já estabelecido pelos módulos anteriores é
// função pura testável em Node puro, sem fake de DOM (ver
// modules/pwa/index.js#registerServiceWorker, que injeta
// `navigator`/`document` em vez de precisar de um). Um parser regex é
// deliberadamente tolerante (nunca lança, ignora o que não reconhece)
// porque a entrada é conteúdo de terceiro — o feed de um blog que o
// projeto não controla.
//
// Como o browser só alcança `frontend/` (Static Assets — wrangler.toml
// `[assets] directory = "frontend"`; mesma restrição documentada em
// modules/pwa/README.md e modules/tour-360/README.md), nem este arquivo
// nem modules/publications/config.js são importados diretamente pelo
// frontend. `renderFrontendModuleSource` embute (`.toString()`, nunca
// redigitado) as funções abaixo — testadas aqui em Node — num ESM
// standalone que scripts/generate-publications-assets.js grava em
// frontend/shared/publications.generated.js (Static Asset real),
// consumido tanto por frontend/painel/ (resolveBloggerFeedUrl,
// validatePublicationsConfig) quanto por frontend/minisite/
// (parseAtomFeed, readPublicationsConfig, formatPublicationDate).

import {
  PUBLICATIONS_MODULE_KEY,
  DEFAULT_PUBLICATIONS_CONFIG,
  isHttpUrl,
  readPublicationsConfig,
  validatePublicationsConfig,
} from "./config.js";

// --- descoberta do feed (painel, uma vez por configuração) -----------------

/**
 * Monta o palpite padrão do feed Atom do Blogger a partir do link do
 * blog colado pelo corretor (`{origin}/feeds/posts/default` — padrão
 * documentado do Blogger/GData). Retorna `null` para entrada
 * ausente/inválida — nunca lança.
 */
export function buildDefaultBloggerFeedUrl(blogUrl) {
  if (typeof blogUrl !== "string" || !blogUrl.trim()) return null;
  try {
    const url = new URL(blogUrl.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}/feeds/posts/default`;
  } catch {
    return null;
  }
}

/** Checagem barata de "isto parece um feed Atom" — usada para não aceitar uma página de erro/HTML como se fosse o feed. */
export function looksLikeAtomFeed(text) {
  return typeof text === "string" && /<feed[\s>]/i.test(text);
}

/**
 * Autodiscovery: procura `<link rel="alternate" type="application/atom+xml" href="...">`
 * no HTML da página do blog (fallback de `resolveBloggerFeedUrl` quando o
 * padrão `{origin}/feeds/posts/default` não bate). `href` relativo é
 * resolvido contra `baseUrl`. Retorna `null` se não encontrar ou se a
 * entrada for inválida — nunca lança.
 */
export function discoverFeedUrlFromHtml(html, baseUrl) {
  if (typeof html !== "string" || !html) return null;
  const linkTagPattern = /<link\b[^>]*>/gi;
  let match;
  while ((match = linkTagPattern.exec(html))) {
    const tag = match[0];
    if (!/type\s*=\s*["']application\/atom\+xml["']/i.test(tag)) continue;
    const hrefMatch = tag.match(/href\s*=\s*"([^"]*)"/i) ?? tag.match(/href\s*=\s*'([^']*)'/i);
    if (!hrefMatch) continue;
    try {
      return new URL(decodeXmlEntities(hrefMatch[1]), baseUrl).href;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Resolve o link do blog colado no painel para o feed Atom real (§47,
 * decisão deste lote — ver header do arquivo). Roda uma única vez, na
 * hora de configurar: 1) tenta o padrão `{origin}/feeds/posts/default`;
 * 2) se a resposta não parecer um feed Atom, busca a página do blog e
 * tenta autodiscovery via `<link rel="alternate" type="application/atom+xml">`,
 * verificando o resultado antes de aceitar. Retorna a URL do feed (string)
 * ou `null` se nada funcionar — nunca lança, `fetchImpl` é injetável para
 * teste (default: `fetch` global, disponível tanto no painel quanto em
 * Workers/Node com fetch nativo).
 */
export async function resolveBloggerFeedUrl(blogUrl, { fetchImpl } = {}) {
  const doFetch = fetchImpl ?? (typeof fetch !== "undefined" ? fetch : null);
  if (!doFetch) return null;

  const candidate = buildDefaultBloggerFeedUrl(blogUrl);
  if (!candidate) return null;

  try {
    const response = await doFetch(candidate);
    if (response.ok && looksLikeAtomFeed(await response.text())) {
      return candidate;
    }
  } catch {
    // segue para o fallback de autodiscovery abaixo
  }

  try {
    const pageResponse = await doFetch(blogUrl);
    if (!pageResponse.ok) return null;
    const html = await pageResponse.text();
    const discovered = discoverFeedUrlFromHtml(html, blogUrl);
    if (!discovered) return null;

    const verifyResponse = await doFetch(discovered);
    if (verifyResponse.ok && looksLikeAtomFeed(await verifyResponse.text())) {
      return discovered;
    }
    return null;
  } catch {
    return null;
  }
}

// --- consumo do feed (minisite, a cada carregamento) ------------------------

const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decodifica entidades XML (nomeadas + numéricas). Entrada não-string vira string vazia — nunca lança. */
function decodeXmlEntities(text) {
  if (typeof text !== "string") return "";
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const codePoint = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

/** Remove marcação (o `summary`/`content` de um post pode vir com HTML) e normaliza espaços. Nunca produz HTML — quem renderiza usa textContent, nunca innerHTML (conteúdo de terceiro). */
function stripTags(text) {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Desembrulha `<![CDATA[ ... ]]>` quando presente; devolve o texto como veio caso contrário. */
function extractCData(text) {
  const match = text.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return match ? match[1] : text;
}

/** Extrai o texto (decodificado, sem tags) do primeiro `<tagName>` encontrado em `xml`. `null` se ausente. */
function extractTagText(xml, tagName) {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i");
  const match = xml.match(pattern);
  if (!match) return null;
  const text = stripTags(decodeXmlEntities(extractCData(match[1])));
  return text || null;
}

/** Extrai a URL do post: prioriza `<link rel="alternate" href="...">` (default do Atom quando `rel` está ausente), cai para o primeiro `<link href="...">` como fallback. `null` se nenhum link com `href` existir. */
function extractEntryUrl(entryXml) {
  const linkTagPattern = /<link\b[^>]*>/gi;
  let match;
  let fallback = null;
  while ((match = linkTagPattern.exec(entryXml))) {
    const tag = match[0];
    const hrefMatch = tag.match(/href\s*=\s*"([^"]*)"/i) ?? tag.match(/href\s*=\s*'([^']*)'/i);
    if (!hrefMatch) continue;
    const relMatch = tag.match(/rel\s*=\s*"([^"]*)"/i) ?? tag.match(/rel\s*=\s*'([^']*)'/i);
    const rel = relMatch ? relMatch[1] : "alternate";
    const href = decodeXmlEntities(hrefMatch[1]);
    if (rel === "alternate") return href;
    if (!fallback) fallback = href;
  }
  return fallback;
}

function extractEntryTitle(entryXml) {
  return extractTagText(entryXml, "title");
}

function extractEntryDate(entryXml) {
  return extractTagText(entryXml, "published") ?? extractTagText(entryXml, "updated");
}

function extractEntrySummary(entryXml, { summaryLength = 280 } = {}) {
  const text = extractTagText(entryXml, "summary") ?? extractTagText(entryXml, "content");
  if (!text) return "";
  return text.length > summaryLength ? `${text.slice(0, summaryLength).trim()}…` : text;
}

/**
 * Faz o parsing de um feed Atom (texto XML) em `{title, url, publishedAt,
 * summary}[]`, mais novo primeiro (ordem do próprio feed). Regex, não
 * DOMParser (ver header do arquivo) — tolerante por design: uma entrada
 * sem `title`/`url` reconhecíveis é descartada, entrada totalmente
 * ilegível vira `[]`. Nunca lança — o feed é conteúdo de terceiro que o
 * projeto não controla. Limitado a `limit` itens (default 10) para não
 * pendurar o minisite num blog com centenas de posts.
 */
export function parseAtomFeed(xmlText, { limit = 10 } = {}) {
  if (typeof xmlText !== "string" || !looksLikeAtomFeed(xmlText)) return [];
  try {
    const entries = xmlText.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
    const items = [];
    for (const entryXml of entries) {
      const title = extractEntryTitle(entryXml);
      const url = extractEntryUrl(entryXml);
      if (!title || !url) continue;
      items.push({ title, url, publishedAt: extractEntryDate(entryXml), summary: extractEntrySummary(entryXml) });
      if (items.length >= limit) break;
    }
    return items;
  } catch {
    return [];
  }
}

/** Formata `publishedAt`/`updated` (RFC3339) para pt-BR. String vazia para entrada ausente/inválida — nunca lança. */
export function formatPublicationDate(dateString) {
  if (typeof dateString !== "string" || !dateString) return "";
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
}

// --- geração do bundle client-side ------------------------------------------

/**
 * Gera o texto completo (standalone ESM, sem imports) de
 * frontend/shared/publications.generated.js. Mesmo padrão de
 * modules/video-youtube/index.js#renderFrontendModuleSource: o código
 * testado aqui em Node é literalmente o que roda no browser. Combina
 * funções deste arquivo com as de modules/publications/config.js (que o
 * browser também não alcança, mesma restrição de Static Assets) num
 * único bundle — painel usa `resolveBloggerFeedUrl`/
 * `validatePublicationsConfig`, minisite usa `parseAtomFeed`/
 * `readPublicationsConfig`/`formatPublicationDate`.
 */
export function renderFrontendModuleSource() {
  return `// frontend/shared/publications.generated.js
//
// GERADO por scripts/generate-publications-assets.js a partir de
// modules/publications/index.js e modules/publications/config.js — não
// editar à mão (§47, módulo publications). Regenerar com:
// npm run generate:publications

const PUBLICATIONS_MODULE_KEY = ${JSON.stringify(PUBLICATIONS_MODULE_KEY)};
const DEFAULT_PUBLICATIONS_CONFIG = Object.freeze(${JSON.stringify(DEFAULT_PUBLICATIONS_CONFIG)});

${isHttpUrl.toString()}

export ${readPublicationsConfig.toString()}

export ${validatePublicationsConfig.toString()}

const XML_ENTITIES = ${JSON.stringify(XML_ENTITIES)};

${decodeXmlEntities.toString()}

${stripTags.toString()}

${extractCData.toString()}

${extractTagText.toString()}

${extractEntryUrl.toString()}

${extractEntryTitle.toString()}

${extractEntryDate.toString()}

${extractEntrySummary.toString()}

export ${looksLikeAtomFeed.toString()}

export ${buildDefaultBloggerFeedUrl.toString()}

export ${discoverFeedUrlFromHtml.toString()}

export ${resolveBloggerFeedUrl.toString()}

export ${parseAtomFeed.toString()}

export ${formatPublicationDate.toString()}
`;
}
