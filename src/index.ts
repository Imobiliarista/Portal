import { removerWWW } from './middleware/www-redirect';

interface Env {
  DB: D1Database;
  JSON_CACHE: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Primeiro middleware: remover "www." do hostname
    const respostaWWW = removerWWW(request);
    if (respostaWWW) {
      return respostaWWW;
    }

    // Por enquanto, responde "em construção" para qualquer rota
    return novaResposta(200, {
      mensagem: 'Portal Imobiliarista — em construção',
      timestamp: new Date().toISOString(),
      hostname: url.hostname,
      caminho: url.pathname,
    });
  },
};

function novaResposta(
  status: number,
  dados: Record<string, unknown>,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      ...headers,
    },
  });
}
