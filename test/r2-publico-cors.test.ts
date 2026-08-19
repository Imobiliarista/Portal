// Bypass R2 público de dados.imobiliarista.net / midias.imobiliarista.net
// (Histórico de Decisões, incidente 2026-08-19, project.md). Workers Routes
// sempre intercepta *.imobiliarista.net antes do R2 Custom Domain, então o
// próprio Worker precisa servir o conteúdo desses dois hostnames fixos,
// com CORS correto pro fetch() feito a partir de qualquer minisite.
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

async function chamar(
  host: string,
  path: string,
  init?: RequestInit & { origin?: string },
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.origin) headers.set("Origin", init.origin);
  return exports.default.fetch(`https://${host}${path}`, {
    ...init,
    headers,
  }) as Promise<Response>;
}

describe("Bypass R2 público — dados/midias.imobiliarista.net", () => {
  it("serve objeto existente de DADOS_CACHE com CORS pro subdomínio de origem", async () => {
    await env.DADOS_CACHE.put("cidades/exemplo.json", JSON.stringify({ ok: true }));

    const resp = await chamar("dados.imobiliarista.net", "/cidades/exemplo.json", {
      origin: "https://aranda.imobiliarista.net",
    });

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://aranda.imobiliarista.net",
    );
    expect(resp.headers.get("Access-Control-Allow-Methods")).toBe("GET, HEAD, OPTIONS");
    expect(await resp.json()).toEqual({ ok: true });
  });

  it("serve objeto existente de MIDIAS com CORS pro domínio raiz", async () => {
    await env.MIDIAS.put("anuncios/foto.jpg", new Uint8Array([1, 2, 3]));

    const resp = await chamar("midias.imobiliarista.net", "/anuncios/foto.jpg", {
      origin: "https://imobiliarista.net",
    });

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("https://imobiliarista.net");
  });

  it("não ecoa Access-Control-Allow-Origin pra origem fora de imobiliarista.net", async () => {
    await env.DADOS_CACHE.put("cidades/exemplo.json", JSON.stringify({ ok: true }));

    const resp = await chamar("dados.imobiliarista.net", "/cidades/exemplo.json", {
      origin: "https://evil.com",
    });

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("responde OPTIONS (preflight) com 204 e headers de CORS", async () => {
    const resp = await chamar("dados.imobiliarista.net", "/qualquer/coisa.json", {
      method: "OPTIONS",
      origin: "https://aranda.imobiliarista.net",
    });

    expect(resp.status).toBe(204);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://aranda.imobiliarista.net",
    );
    expect(resp.headers.get("Access-Control-Allow-Methods")).toBe("GET, HEAD, OPTIONS");
  });

  it("retorna 404 com headers de CORS quando o objeto não existe", async () => {
    const resp = await chamar("dados.imobiliarista.net", "/nao-existe.json", {
      origin: "https://aranda.imobiliarista.net",
    });

    expect(resp.status).toBe(404);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://aranda.imobiliarista.net",
    );
  });

  it("não trata dados.imobiliarista.net como slug de tenant (bypass roda antes)", async () => {
    // Confirma que o hostname fixo nunca cai em extrairSlugDoSubdominio —
    // se caísse, tentaria carregar o minisite do "corretor" chamado
    // "dados", nunca servindo o R2 diretamente.
    await env.DADOS_CACHE.put("status.json", "conteudo-do-bucket");

    const resp = await chamar("dados.imobiliarista.net", "/status.json");

    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe("conteudo-do-bucket");
  });
});
