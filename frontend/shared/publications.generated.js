// frontend/shared/publications.generated.js
//
// GERADO por scripts/generate-publications-assets.js a partir de
// modules/publications/index.js e modules/publications/config.js — não
// editar à mão (§47, módulo publications). Regenerar com:
// npm run generate:publications

const PUBLICATIONS_MODULE_KEY = "publications";
const DEFAULT_PUBLICATIONS_CONFIG = Object.freeze({"enabled":false,"feedUrl":null});

function isHttpUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function readPublicationsConfig(broker) {
  const raw = broker?.modules?.[PUBLICATIONS_MODULE_KEY];
  if (!raw || typeof raw !== "object") return DEFAULT_PUBLICATIONS_CONFIG;
  const feedUrl = isHttpUrl(raw.feedUrl) ? raw.feedUrl : null;
  return { enabled: raw.enabled === true && feedUrl !== null, feedUrl };
}

export function validatePublicationsConfig({ enabled, feedUrl } = {}) {
  if (typeof enabled !== "boolean") {
    return { valid: false, error: "enabled precisa ser true ou false." };
  }
  const normalizedFeedUrl = feedUrl === undefined || feedUrl === null ? null : feedUrl;
  if (normalizedFeedUrl !== null && !isHttpUrl(normalizedFeedUrl)) {
    return { valid: false, error: "feedUrl inválido." };
  }
  if (enabled && !normalizedFeedUrl) {
    return { valid: false, error: "Configure o link do blog antes de habilitar as publicações." };
  }
  return { valid: true, config: { enabled, feedUrl: normalizedFeedUrl } };
}

const XML_ENTITIES = {"amp":"&","lt":"<","gt":">","quot":"\"","apos":"'"};

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

function stripTags(text) {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractCData(text) {
  const match = text.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return match ? match[1] : text;
}

function extractTagText(xml, tagName) {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i");
  const match = xml.match(pattern);
  if (!match) return null;
  const text = stripTags(decodeXmlEntities(extractCData(match[1])));
  return text || null;
}

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

export function looksLikeAtomFeed(text) {
  return typeof text === "string" && /<feed[\s>]/i.test(text);
}

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

export function formatPublicationDate(dateString) {
  if (typeof dateString !== "string" || !dateString) return "";
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
}
