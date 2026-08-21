// lib/r2.ts::escreverJSON — gravava content-type/cache-control dentro de
// `customMetadata` (chaves arbitrárias, nunca viram headers HTTP reais) em
// vez de `httpMetadata` (contentType/cacheControl — o campo que
// R2Object::writeHttpMetadata() de fato lê). Resultado: todo JSON gerado
// pelos jobs (cidades/corretores) era servido por servirR2Publico
// (src/index.ts, bypass de dados.imobiliarista.net) sem Content-Type nem
// Cache-Control — mesmo com escreverJSON "parecendo" configurar os dois.
// Outros pontos do código (scheduled.ts, modulos/pwa/logica.ts,
// modulos/feed-portais-independentes/gerador.ts) sempre usaram
// `httpMetadata` corretamente; only escreverJSON estava errado.
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { escreverJSON } from "../src/lib/r2";

async function chamar(host: string, path: string): Promise<Response> {
  return exports.default.fetch(`https://${host}${path}`) as Promise<Response>;
}

describe("lib/r2.ts::escreverJSON — metadados HTTP", () => {
  it("grava Content-Type e Cache-Control como httpMetadata (servidos de verdade via dados.imobiliarista.net)", async () => {
    await escreverJSON(env.DADOS_CACHE, "cidades/teste-metadados-r2.json", { ok: true });

    const resposta = await chamar("dados.imobiliarista.net", "/cidades/teste-metadados-r2.json");
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toBe("application/json");
    expect(resposta.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await resposta.json()).toEqual({ ok: true });
  });
});
