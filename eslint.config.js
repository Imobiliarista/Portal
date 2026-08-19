// Config mínima (flat config, ESLint 9) — só o suficiente pra `npm run
// lint` rodar sem o erro de "config ausente" (achado da sessão anterior,
// nunca corrigido até o Lote 19). Usa os presets recomendados de
// @eslint/js e typescript-eslint sem regras customizadas — não é
// exaustiva de propósito.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".wrangler/**",
      "public/assets/css/tailwind.css", // gerado, não commitado, mas ignorado por segurança
      "migrations/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // `any` é usado deliberadamente em vários pontos do código existente
      // (payloads de D1/mensagens de fila com shape dinâmico) — travar essa
      // regra retroativamente exigiria tipar dezenas de pontos não
      // relacionados ao Lote 19. Fora de escopo aqui.
      "@typescript-eslint/no-explicit-any": "off",
      // Convenção já usada no código (ex.: status-backend.ts) pra parâmetro
      // exigido pela assinatura da interface mas não usado no corpo.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: { ...globals.worker },
    },
  },
  {
    // public/assets/js/*.js são scripts clássicos (sem type="module"),
    // carregados em sequência por public/*/index.html e compartilhando
    // escopo global entre si (ex.: appState, CONFIG, renderListings
    // definidos num arquivo e usados em outro; L/google vêm de scripts
    // externos via CDN). ESLint analisa cada arquivo isoladamente, então
    // não tem como saber que esses globais existem — desligar no-undef/
    // no-unused-vars aqui evita falso positivo em massa sem exigir mapear
    // manualmente cada global cross-file.
    files: ["public/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["scripts/**/*.js", "*.config.js", "test/**/*.ts", "vitest.config.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  }
);
