import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Smoke test de integração (Lote 19, project.md seção 10) — roda dentro do
// runtime real dos Workers via Miniflare (D1/R2/Queue reais, não mocks),
// mesma abordagem validada manualmente na recuperação da PR #56/#59.
export default defineConfig(async () => {
  const migrationsPath = path.join(import.meta.dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.test.toml" },
        miniflare: {
          // Binding só de teste, lido por test/apply-migrations.ts — nunca
          // referenciado pelo código de produção.
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      testTimeout: 20000,
    },
  };
});
