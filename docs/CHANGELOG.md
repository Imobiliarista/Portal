# Changelog

## Etapa 4 — Auth (§90)

- `business/auth.js` (novo): identidade de credencial em
  `auth/{userId}.json`, separada do perfil do corretor (schema
  `broker.schema.json` tem `additionalProperties: false` — não há onde
  colocar `passwordHash` ali). `setAuthPassword` cria/atualiza o hash
  (`core/auth.js`, PBKDF2) e incrementa `authVersion`; não é um fluxo de
  cadastro novo — `business/brokers.createBroker` continua não recebendo
  senha. `login` compõe `business/brokers.getBrokerByEmail` (contexto de
  tenant: brokerId/slug) com `getAuthUser` (credencial: passwordHash/role/
  authVersion) e emite sessão via `core/session.js#createSessionToken`.
  Todo caminho de falha (e-mail inexistente, sem credencial, senha errada)
  lança o mesmo `InvalidCredentialsError` — inclusive rodando o hashing
  contra um hash "dummy" quando não há credencial real, para não vazar por
  timing se o e-mail existe.
- `worker/auth.js`: implementado (era placeholder da Etapa 1). Expõe
  `handleLogin`/`handleLogout` (§72) e o middleware
  `getSession`/`requireSession`/`requireTenant`, que lê o cookie assinado
  de um `Request`, verifica via `core/session.js` e resolve o tenant via
  `core/tenant.js` — nunca a partir do corpo da requisição (§55).
- `worker/index.js`: `POST /api/auth/login` e `POST /api/auth/logout`
  ligados (o comentário original do placeholder `worker/auth.js` já dizia
  que login/sessão pertence a esta etapa). `/api/me/*` e `/api/admin/*`
  continuam 501 — isso é Etapa 5/8.
- `core/session.js`: nova `UnauthorizedError`, para `core/app.js` devolver
  401 de forma consistente com o tratamento já existente de
  `ValidationError`/`ForbiddenError`/`TenantMismatchError`.
- Sessão é stateless (§28): logout apenas expira o cookie
  (`buildLogoutCookie`, já existente desde a Etapa 1) — nenhuma lista de
  revogação foi introduzida (evitaria §93 ao exigir KV/D1).
- 20 novos testes: `tests/business/auth.test.js` (unitário — hashing,
  login com credencial certa/senha errada/e-mail inexistente, mensagem
  genérica idêntica nos dois casos de falha) e
  `tests/security/auth-flow.test.js` (ponta a ponta — handlers HTTP de
  login/logout, sessão válida/expirada/adulterada, e bloqueio de acesso
  cross-tenant combinando uma sessão real emitida pelo login com
  `business/listings.updateListing`/`core/tenant.js#assertTenantMatch`).

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
