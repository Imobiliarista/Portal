import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Aplica migrations/0001_init.sql até a mais recente, em ordem, no D1 local
// de cada worker de teste. applyD1Migrations só aplica o que ainda não foi
// aplicado, então é seguro rodar isso a cada arquivo de teste (setupFiles
// roda por worker isolado, não uma vez só pro processo inteiro).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
