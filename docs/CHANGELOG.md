# Changelog

## Etapa 3 — R2 privado (§90)

- `business/brokers.js`: CRUD do corretor privado (§29) —
  `createBroker`, `updateBrokerProfile`, `getBrokerById`, `getBrokerBySlug`,
  `getBrokerByEmail`. Sem hash de senha, login ou sessão (isso é Etapa 4).
- `business/listings.js`: CRUD do anúncio privado (§30) —
  `createListing`, `updateListing`, `getListingById`,
  `listListingsByBroker`. Sem publicador/projeção pública (isso é Etapa 6).
- Novo índice privado `broker-email` em `storage/indexes.js` +
  `storage/keys.js` (`indexes/broker-emails/{hash}.json` → `{ brokerId }`),
  reutilizando `loginIdentifierHash` já existente. Distinto do índice
  `login` (que resolve para `userId`, identidade de auth).
- Isolamento multitenant (§55): toda função de negócio recebe `brokerId`
  como argumento posicional explícito, nunca lido de `input`/`patch`;
  `updateListing` revalida o `brokerId` do recurso carregado contra o
  argumento (`TenantMismatchError` de `core/tenant.js`).
- 34 novos testes unitários (`tests/business/brokers.test.js`,
  `tests/business/listings.test.js`, mais o índice `broker-email` coberto
  em `tests/storage/indexes.test.js`), todos com `FakeR2Bucket` (sem R2
  real).

## Etapa 1 — Fundação (§90)

- Estrutura completa do repositório conforme §67 (placeholders onde ainda
  não há lógica de negócio).
- `core/` implementado: auth (hash de senha PBKDF2), session (token
  assinado HMAC stateless), tenant, permissions, validation (allowlist),
  security (headers §81, CORS §80), router, response, logger (redação de
  campos sensíveis §79), app (composição).
- `storage/` implementado: keys (builders determinísticos), private,
  public, media (validação MIME/tamanho §57), indexes (login/slug/broker→
  listings, sem varredura de bucket §26), cache (TTLs §59-§61).
- 9 JSON Schemas em `schemas/`.
- `wrangler.toml` com bindings para os 3 buckets R2 (`imob-private`,
  `imob-data`, `imob-media`) e Static Assets apontando para `frontend/`.
- 84 testes unitários (`node --test`) cobrindo `core/` e `storage/`.
