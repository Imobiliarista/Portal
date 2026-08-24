# imobiliarista.net

Portal imobiliário + minisites de corretores, em arquitetura JSON/R2 (sem
D1/KV/SQL). Fonte normativa:
[`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`](./IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md).

Documentação de apoio em [`docs/`](./docs/):

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/DATA-MODEL.md`](./docs/DATA-MODEL.md)
- [`docs/MODULES.md`](./docs/MODULES.md)
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)
- [`docs/CHANGELOG.md`](./docs/CHANGELOG.md)

## Desenvolvimento

```bash
npm install
npm test                  # suíte core/ + storage/ + business/ + frontend/
npm run validate:schemas  # valida schemas/*.schema.json
npm run dev                # wrangler dev
```

Implementação em lotes, um PR por etapa (§90-§92 do documento normativo).
Status atual: **Etapa 3 — R2 privado**.
