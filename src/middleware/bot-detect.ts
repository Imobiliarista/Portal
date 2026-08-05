// Middleware de detecção de robôs de busca e previsualizadores
// Identifica Googlebot, Bingbot, WhatsApp, Facebook, LinkedIn, etc. via User-Agent
// Ver project.md, seção 4.6 (dynamic rendering).
// Por enquanto, só a função de detecção (retorna true/false).
// A geração do HTML pré-renderizado fica para o Lote 11 (SEO).

const BOTS_USER_AGENTS = [
  // Google
  /googlebot/i,
  /google-structured-data-testing-tool/i,
  /google-site-verification/i,

  // Bing
  /bingbot/i,
  /msnbot/i,

  // Facebook / Meta
  /facebookexternalhit/i,
  /facebook/i,

  // WhatsApp
  /whatsapp/i,

  // LinkedIn
  /linkedinbot/i,

  // Twitter / X
  /twitterbot/i,

  // Telegram
  /telegrambot/i,

  // Outros crawlers
  /baidu/i,
  /yandex/i,
  /duckduckbot/i,
  /baiduspider/i,
  /curl/i,
  /wget/i,
  /slurp/i, // Yahoo
  /pinterest/i,
  /inoreader/i,
  /feedly/i,
  /crawler/i,
  /spider/i,
  /bot/i,
];

export function ehBot(request: Request): boolean {
  const userAgent = request.headers.get("user-agent") || "";

  if (!userAgent) {
    return false;
  }

  return BOTS_USER_AGENTS.some((pattern) => pattern.test(userAgent));
}
