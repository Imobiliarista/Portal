// Entrypoint StatusBackend — v11.4, Arquitetura de Cache Multi-Tenant
// (PROJETO_EXECUTIVO_ARQUITETURA_IMOBILIARISTA_v11_4, seções 42-44).
//
// Lê tenants/{tenant}/status.json do R2 (DADOS_CACHE), nunca D1 — mesma
// regra de sempre (jobs/gerar-status-minisite.ts materializa o artefato).
// Exportado com [exports.StatusBackend.cache] enabled=true em
// wrangler.toml: em cache hit, este entrypoint não roda — só o Gateway
// (src/index.ts) executa, e nem chega a invocar ctx.exports.
//
// tenant vem exclusivamente de ctx.props.tenant, populado pelo Gateway a
// partir do hostname antes de chamar ctx.exports — nunca lido do
// hostname aqui dentro (seções 36-39: é o único mecanismo válido pra
// isolar a chave de cache por tenant; ler o hostname diretamente aqui
// não entraria na chave e colidiria corretor A com corretor B).
//
// TTL curto (60s): status de suspensão/moderação precisa propagar rápido
// — ver seção 42 (dois caches, TTLs incompatíveis com o site em si).

import { WorkerEntrypoint } from "cloudflare:workers";
import { Env } from "./index";
import { lerJSON } from "./lib/r2";
import type { StatusMinisiteJSON } from "./jobs/gerar-status-minisite";

interface StatusBackendProps {
  tenant: string;
}

export class StatusBackend extends WorkerEntrypoint<Env, StatusBackendProps> {
  async fetch(_request: Request): Promise<Response> {
    const { tenant } = this.ctx.props;

    const status = await lerJSON<StatusMinisiteJSON>(
      this.env.DADOS_CACHE,
      `tenants/${tenant}/status.json`,
    );

    return new Response(JSON.stringify(status), {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=60",
      },
    });
  }
}
