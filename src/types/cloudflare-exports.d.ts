// Declara os exports do módulo principal pro tipo de `ctx.exports`
// (Cloudflare.Exports) — necessário pro TypeScript reconhecer
// `ctx.exports.StatusBackend`/`ctx.exports.SiteBackend` como entrypoints
// válidos (v11.4, seções 38-40: ctx.props via ctx.exports é o único
// mecanismo válido de isolamento de tenant no cache).
//
// Normalmente `wrangler types` gera essa declaração automaticamente, mas
// também geraria um `Env` duplicado — este projeto mantém `Env` sempre
// manualmente em src/index.ts. Declarado à mão aqui pra não depender de
// rodar `wrangler types` a cada mudança de exports.
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("../index");
  }
}
