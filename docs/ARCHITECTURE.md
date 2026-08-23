# Arquitetura

Fonte normativa: [`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`](../IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md)
(v1.1, 2026-08-23). Em qualquer divergência, o documento normativo prevalece
sobre este resumo.

## Princípio central

```text
GitHub            → software (código, schemas, testes, docs)
Static Assets     → shell público + painel + admin
R2 PRIVATE        → estado autoritativo (auth, corretores, drafts)
R2 DATA           → projeções públicas (cidades, imóveis, corretores, índices, exports)
R2 MEDIA          → fotos, vídeos, mídia
Worker/API        → apenas rotas privadas/transacionais (§71-72)
Browser           → roteamento, filtros, busca, renderização
```

Sem D1, sem KV, sem SQL, sem migrations. A unidade pública principal é a
**cidade** (§7-§9), particionada em shards de no máximo 300 cards ou ~1 MB
comprimido — nunca um JSON nacional único.

## Camadas do repositório (§67-§71)

- **`core/`** — auth, session, tenant, permissions, validation, security,
  router, response, logger. Não conhece módulos opcionais (§39, §68).
- **`storage/`** — única camada que fala diretamente com os bindings R2
  (`IMOB_PRIVATE`, `IMOB_DATA`, `IMOB_MEDIA`). Constrói chaves determinísticas
  (`storage/keys.js`) para nunca depender de varredura de bucket (§26).
- **`business/`** — domínio (brokers, listings, cities, taxonomy, cards,
  publishing, media, exports). Placeholder até Etapa 2+.
- **`modules/`** — funcionalidades opcionais/desacopladas (§38-§52).
  Dependência permitida: `modules → business → core → storage`. Nunca o
  inverso (§39).
- **`worker/`** — entry point HTTP privado (§71-72). Pequeno por design;
  navegação pública não passa por aqui (§73, §89).
- **`frontend/`** — 4 SPAs estáticos: `portal/`, `minisite/`, `painel/`,
  `admin/`.
- **`schemas/`** — contratos JSON Schema dos objetos públicos/privados.

## Ordem de implementação

Ver §90 do documento normativo — Etapa 1 (Fundação) → Etapa 11 (Hardening).
Este repositório avança em lotes, um PR coerente por etapa (§91-§92).
