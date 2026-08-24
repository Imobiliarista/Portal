# Modelo de dados

Ver §6-§25 e §61-§66 do documento normativo para a especificação completa.
Este documento resume onde encontrar cada peça no código.

## Três camadas (§6)

```text
PRIVADO/AUTORITATIVO (R2 PRIVATE)  → manifest, draft, auth, estado
PUBLICADOR                          → normaliza, valida, gera projeções
PÚBLICO (R2 DATA)                   → cards, imóvel completo, corretor, cidade, exports
```

> R2 privado guarda estado. R2 público guarda projeções reconstruíveis.

## Chaves determinísticas

`storage/keys.js` é a fonte única de verdade para o layout de chaves —
nunca construir uma chave R2 manualmente fora desse módulo:

- `privateKeys.*` → layout de `IMOB_PRIVATE` (§23)
- `dataKeys.*` → layout de `IMOB_DATA` (§24)
- `mediaKeys.*` → layout de `IMOB_MEDIA` (§25)

Constantes de particionamento (§9), também centralizadas ali:

```js
MAX_CARDS_PER_SHARD = 300
TARGET_COMPRESSED_SHARD_BYTES = 1_000_000 // ~1 MB
REBUILD_BATCH_SIZE = 100 // §34
```

## Schemas (`schemas/*.schema.json`)

| Schema | Objeto | Bucket |
| --- | --- | --- |
| `city-manifest.schema.json` | `cities/{city}/manifest.json` (§12) | DATA |
| `city-index.schema.json` | `cities/{city}/index.json` (§21) | DATA |
| `city-shard.schema.json` | `cities/{city}/{NNN}.json` (§13-§14) | DATA |
| `listing-draft.schema.json` | `listings/{listingId}/draft.json` (§30-§31) | PRIVATE |
| `listing-public.schema.json` | `listings/{slug}.json` (§15) | DATA |
| `broker.schema.json` | `brokers/{brokerId}/profile-draft.json` (§29) | PRIVATE |
| `broker-public.schema.json` | `brokers/{slug}/profile.json` (§16, §76) | DATA |
| `taxonomy.schema.json` | `portal/taxonomy.json` (§65) | DATA |
| `export.schema.json` | `exports/{brokers,listings,cities}/{slug}.json` (§62) | DATA |

Validação estrutural: `npm run validate:schemas` (`scripts/validate-json.js`).

## Índices privados (§26)

`storage/indexes.js` implementa os índices que evitam varredura de bucket:

- **login** → `loginIdentifierHash(email)` (SHA-256 do e-mail normalizado)
  resolve para `{ userId }`. Índice de identidade de auth (Etapa 4).
- **slug** → qualquer slug público (corretor ou imóvel) resolve para
  `{ type, id }`. Usado por `business/brokers.js#getBrokerBySlug` (broker-by-slug).
- **broker-email** → `loginIdentifierHash(email)` resolve para
  `{ brokerId }`. Distinto do índice de login: resolve o e-mail de contato
  do corretor direto para seu `brokerId`, sem envolver auth/sessão. Usado por
  `business/brokers.js#getBrokerByEmail` (broker-by-email; §29, necessário
  para o login da Etapa 4, mas não faz parte dela).
- **broker → listingIds** → lista de imóveis de um corretor, para o painel
  "meus imóveis" sem varrer `listings/`. Usado por
  `business/listings.js#listListingsByBroker` (listings-by-broker).
- **city → listingIds** (`indexes/cities/{city}/listings.json`, Etapa 6) →
  todo anúncio já publicado sob uma cidade (qualquer status — a entrada
  nunca é removida), para `business/publishing.js#rebuildCity` achar os
  anúncios de uma cidade sem varrer `listings/`.
- **registro de cidades** (`indexes/cities.json`, Etapa 6) → todo slug de
  cidade que já teve algum anúncio publicado, para
  `business/publishing.js#rebuildAll` enumerar "todas as cidades" sem
  varrer `indexes/cities/`. Cresce monotonicamente (nunca remove um slug —
  cidade sem anúncios ainda publica um manifest vazio válido, §77).

## Business privado (§29-§30, Etapa 3)

- `business/brokers.js` — CRUD do corretor privado (`brokers/{brokerId}/*`):
  `createBroker`, `updateBrokerProfile`, `getBrokerById`, `getBrokerBySlug`,
  `getBrokerByEmail`. Sem hash de senha, login ou sessão (Etapa 4).
- `business/listings.js` — CRUD do anúncio privado
  (`listings/{listingId}/*`): `createListing`, `updateListing`,
  `getListingById`, `listListingsByBroker`. Sem publicador (Etapa 6).
- Isolamento multitenant (§55): toda função de escrita/leitura escopada a um
  corretor recebe `brokerId` como argumento posicional explícito — nunca lido
  do corpo (`input`/`patch`). `updateListing` também revalida o `brokerId` do
  draft carregado contra o argumento antes de gravar
  (`core/tenant.js#TenantMismatchError`).

## Auth privado (§26-§28, Etapa 4)

- `auth/{userId}.json` (`storage/keys.js#privateKeys.authUser`) — identidade
  de credencial: `{ schemaVersion, userId, role, passwordHash, authVersion,
  updatedAt }`. Deliberadamente **não** faz parte de `broker.schema.json`
  (que tem `additionalProperties: false`) nem de nenhum schema em
  `schemas/` — objeto puramente privado/de segurança, nunca serializado
  para fora do Worker. Gerido por `business/auth.js#setAuthPassword`/
  `getAuthUser`.
- `business/auth.js#login` compõe duas buscas independentes por e-mail:
  `business/brokers.getBrokerByEmail` (índice `broker-email` → contexto de
  tenant: `brokerId`/`slug`) e `getAuthUser` (a partir do `userId` do
  broker → credencial). O índice `login` (`loginIdentifierHash` → `{
  userId }`, já existente desde a Etapa 1) fica disponível para uma
  identidade de auth sem perfil de corretor (ex.: superadmin, Etapa 8) mas
  não é usado pelo login de corretor desta etapa.
- `worker/auth.js` — único lugar que lê o cookie de sessão de um `Request`
  (`getSession`/`requireSession`/`requireTenant`); resolve o tenant sempre
  via `core/tenant.js#resolveTenant(session)`, nunca do corpo (§55).

## Publicador (§31-34, §64, Etapa 6)

`business/publishing.js` é a ponte entre o estado privado (acima) e as
projeções públicas que `frontend/portal`/`frontend/minisite` (Lote 2) leem
direto do R2 DATA, sem Worker (§73):

- `publishListing(env, listingId)` — publicação incremental (§32): faz
  upsert do listing completo (`listings/{slug}.json`) e do card só no shard
  único da cidade atual (§90 — shard único nesta etapa, particionamento é
  Etapa 7), atualiza `cities/{city}/index.json` e bumpa
  `cities/{city}/manifest.json`. Também publica/atualiza o perfil público
  do corretor se estiver ausente/desatualizado. Mapeamento de status
  privado→público e a lista completa de decisões desta etapa estão no
  cabeçalho do próprio arquivo.
- `publishBroker(env, brokerId, { force })` — idem para
  `brokers/{slug}/profile.json`, com checagem de staleness comparando
  `broker.updatedAt` contra o que foi publicado por último (bookkeeping em
  `brokers/{brokerId}/manifest.json`, PRIVATE — nenhum schema público
  restringe esse manifest).
- `rebuildListing`/`rebuildBroker`/`rebuildCity`/`rebuildAll` (§33-34) —
  reconstrução a partir do estado privado, para divergência ou mudança de
  schema. `rebuildCity` descarta e recalcula o shard/index/manifest inteiro
  de uma cidade (usa o índice city→listingIds acima); `rebuildAll`
  processa cidades em lotes checkpointáveis
  (`jobs/rebuild-all/checkpoint.json`, PRIVATE) — nunca tudo de uma vez.
  CLIs em `scripts/rebuild-*.js` (usam `getPlatformProxy` do wrangler para
  os bindings reais).
- `business/cards.js` — `buildListingCard`/`buildIndexEntry`, mapeamento
  puro listing-public → card (§13) → índice (§21). Sem R2 aqui.
- `business/cities.js` — resolve `city.name`/`city.uf` (exigidos por
  `city-manifest.schema.json`) a partir de
  `business/data/cities-catalog.generated.js`, catálogo estático gerado
  por `scripts/generate-cities-catalog.js` (IBGE, rodado manualmente —
  **pendente**: o arquivo commitado hoje é só uma amostra, ver
  docs/CHANGELOG.md#etapa-6). Cidade fora do catálogo é `UnknownCityError`
  explícito.

## Versionamento (§61)

Todo JSON relevante carrega `schemaVersion` e, quando aplicável,
`publicationVersion` + `publishedAt`/`lastUpdated`.
