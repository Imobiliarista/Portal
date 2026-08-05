import { rotasAuth } from "./routes/api-auth";

export interface Env {
  DB: D1Database;
  JSON_CACHE: R2Bucket;
  FILA_ALTERACOES: Queue;
  TURNSTILE_SECRET_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Regra de remoção do "www" — sempre a primeira etapa do fetch().
    // Ver project.md, seção 4.5.
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.replace("www.", "");
      return Response.redirect(url.toString(), 301);
    }

    // Roteador de autenticação
    if (url.pathname.startsWith("/api/auth/")) {
      return rotasAuth(request, env);
    }

    return new Response("Portal Imobiliarista — em construção", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
