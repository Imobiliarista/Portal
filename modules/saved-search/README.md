# Módulo: saved-search

Ver §43 (e §38-§40, §67, §90, §94) de
`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`. §43 é só a árvore
de arquivos do módulo:

```text
modules/saved-search/
├── index.js
├── service.js
├── notifications.js
└── README.md
```

Nenhuma linha sobre o fluxo em si — quem salva a busca, como fica o
storage, se precisa de rate limit, se a notificação depende de cron. Por
instrução explícita do solicitante para este lote ("pare e pergunte se
ficar ambíguo... não decida sozinho"), as três perguntas abaixo foram
feitas antes de qualquer código, e as respostas moldaram o módulo inteiro
— mesmo espírito de `modules/appointments/README.md` (§41) na mesma
etapa.

## Decisões tomadas (confirmadas com o solicitante antes deste lote)

1. **Visitante público do portal, sem login.** O nome do módulo
   (busca-salva-**email**, padrão clássico "salvar busca" de portal
   imobiliário — Zillow, ZAP, etc.) e o fato de estar em `modules/` (não
   em `painel/`) já apontavam nessa direção; confirmado antes de desenhar
   o storage. Consequência direta: **nenhum brokerId/tenant/sessão** em
   lugar nenhum deste módulo — o registro (`saved-searches/{id}.json`,
   R2 PRIVATE) é endereçado só pelo próprio id, nunca por corretor. Isso
   também descarta qualquer tela nova em `frontend/painel/` — a interação
   inteira acontece no portal público (ou, além do escopo deste lote, por
   e-mail).
2. **Anti-abuso: double opt-in por e-mail + limite por IP/dia**, combinando
   a pista que o próprio solicitante deu na pergunta 1 ("provavelmente só
   e-mail + confirmação de opt-in") com um limite simples pedido na
   pergunta 2. Sem KV/D1/Durable Objects neste projeto (só R2 + Static
   Assets no `wrangler.toml`) — o limite por IP é um contador simples em
   R2 PRIVATE (`storage/keys.js#privateKeys.savedSearchRateLimit`, 5
   salvamentos/IP/dia). O double opt-in por si só já é o mecanismo
   principal: nenhum alerta é enviado — nem mesmo o primeiro — antes do
   clique de confirmação, então "salvar uma busca em nome de terceiros"
   só consegue mandar UM e-mail de confirmação para a vítima, nunca uma
   sequência de alertas. Ver pendências abaixo para o que esse desenho
   deliberadamente não cobre (flood de e-mails de confirmação vindo de
   IPs diferentes contra a mesma vítima).
3. **Notificação disparada direto do fluxo de publicação, sem cron.**
   `worker/cron.js` continua um placeholder vazio, sem `[triggers]` no
   `wrangler.toml` — criar isso do zero (mais um cursor "o que é novo
   desde a última execução" persistido em algum lugar) era claramente mais
   máquina nova do que o precedente já existente no mesmo arquivo:
   `worker/api.js` já importa `modules/feeds` e chama `regenerateFeeds()`
   depois de cada `publishListing`/`publishBroker` bem-sucedido (Etapa
   6/7). `modules/saved-search` segue exatamente esse padrão —
   `checkSavedSearchesForListing` (exportado por `index.js`, implementado
   em `service.js`) é chamado por `worker/api.js#maybeNotifySavedSearches`
   logo depois de cada `publishListing` nos três handlers de
   `/api/me/listings/*` (create/update/delete). Trade-off explícito desta
   escolha: publicações que não passam por esses três handlers
   (`rebuildCity`/`rebuildAll`/suspensão de corretor, todos em
   `business/publishing.js`) não disparam notificação — ver
   `docs/OPERATIONS.md#pendências-não-bloqueantes--módulo-saved-search-§43`
   item 6.

## Desenho (decisões de implementação dentro do escopo acima)

- **Storage**: `saved-searches/{savedSearchId}.json` — registro flat, sem
  split draft/manifest (mesma lógica de `plans/{planId}.json`: não existe
  um "publicar" separado para uma busca salva). Campos: `status`
  (`pending` → `confirmed` → opcionalmente `unsubscribed`), `email`,
  `criteria`, `notifiedListingSlugs` (dedup — ver abaixo) e timestamps.
- **Índice por cidade** (`indexes/saved-searches/cities/{citySlug}.json`,
  `storage/indexes.js#getSavedSearchIdsForCity`/`addSavedSearchToCityIndex`/
  `removeSavedSearchFromCityIndex`, mesmo padrão de `cityListingsIndex`):
  só contém ids **confirmados e ainda inscritos** — é isso que permite
  `checkSavedSearchesForListing` achar candidatos para um imóvel publicado
  sem escanear `saved-searches/` inteiro (§26). Populado no confirm,
  removido no unsubscribe.
- **Critério de busca** (`criteria`): os mesmos campos de filtro do card/
  índice compacto (§20/§21) — `city` (obrigatório, valida contra
  `business/cities.js#getCityBySlug`), `purpose` (`venda`/`aluguel`),
  `type`, `district`, `priceMin`/`priceMax`, `bedroomsMin`/`bathroomsMin`/
  `parkingSpacesMin`, `areaMin`. `modules/saved-search/service.js#matchesCriteria`
  é pura (sem I/O) e compara direto contra `listing-public.schema.json`.
- **Tokens de confirmação/cancelamento**: auto-contidos e assinados,
  reaproveitando `core/session.js#createSessionToken`/`verifySessionToken`
  (a mesma primitiva HMAC-claims-com-expiração que já assina o cookie de
  sessão) com um secret PRÓPRIO (`SAVED_SEARCH_TOKEN_SECRET`, nunca
  `SESSION_SECRET`). Isso evita uma segunda tabela de índice só para
  resolver "token → savedSearchId": o token já carrega o id e a
  assinatura garante que não foi forjado; o registro em si continua uma
  leitura por chave determinística (§26). Token de confirmação expira em
  7 dias; o de cancelamento, ~10 anos (não existe um caso de produto para
  um link de descadastro "expirar", então isso equivale a "não expira"
  sem precisar de um caminho de código à parte na primitiva reaproveitada).
- **Dedup de notificação**: cada registro guarda `notifiedListingSlugs` —
  um mesmo (busca salva, anúncio) só gera e-mail uma vez, mesmo que o
  anúncio seja republicado várias vezes (preço, fotos, etc.) depois de já
  ter dado match e notificado. Sem isso, cada hook de publicação num
  anúncio que já combina reenviaria o mesmo alerta.
- **Sem página/SPA dedicada para confirmar/cancelar** — os links do
  e-mail apontam direto para `GET /api/saved-searches/confirm`/
  `/unsubscribe`, que respondem com uma página HTML mínima própria
  (`modules/saved-search/index.js#htmlPage`), não JSON. Escolha
  deliberada: o pedido deste lote não incluiu frontend algum (diferente
  de `modules/appointments` na mesma etapa, que precisava de um
  componente DOM) — ver pendências.
- **Sem `routes.js`** — diferente de `modules/appointments` (§41, que lista
  `routes.js` na árvore), §43 não prevê esse arquivo. Os handlers HTTP
  (`handleCreateSavedSearch`/`handleConfirmSavedSearch`/
  `handleUnsubscribeSavedSearch`) moram em `index.js` mesmo, registrados
  direto em `worker/index.js` — mesmo estilo "thin handler" de
  `worker/api.js`.

## Escopo deste lote

- `modules/saved-search/service.js`: regras de negócio — criação (com
  rate limit + validação allowlist), confirmação, cancelamento, match
  (`matchesCriteria`) e o orquestrador `checkSavedSearchesForListing`.
- `modules/saved-search/notifications.js`: integração com Resend (`POST
  https://api.resend.com/emails`, `RESEND_API_KEY`) — e-mail de
  confirmação e e-mail de alerta de match. Remetente
  `alertas@imobiliarista.net` (domínio já verificado na conta Resend,
  decisão do solicitante, fora deste lote).
- `modules/saved-search/index.js`: os três handlers HTTP públicos +
  reexport de `checkSavedSearchesForListing` para `worker/api.js`.
- `storage/keys.js`: três chaves novas (`savedSearch`,
  `savedSearchCityIndex`, `savedSearchRateLimit`).
- `storage/indexes.js`: três funções novas (`getSavedSearchIdsForCity`/
  `addSavedSearchToCityIndex`/`removeSavedSearchFromCityIndex`) +
  `hmacSha256Hex` exportado (era privado; reaproveitado aqui para o hash
  do IP no rate limit, com secret próprio — ver o comentário no arquivo).
- `worker/index.js`: três rotas públicas novas
  (`POST /api/saved-searches`, `GET /api/saved-searches/confirm`,
  `GET /api/saved-searches/unsubscribe`).
- `worker/api.js`: hook `maybeNotifySavedSearches` chamado depois de
  `publishListing` nos três handlers de `/api/me/listings/*` (mesmo
  padrão de `maybeRegenerateFeeds`/`modules/feeds`).
- `wrangler.toml`/`docs/OPERATIONS.md`: dois secrets novos documentados
  como pendentes (`RESEND_API_KEY`, `SAVED_SEARCH_TOKEN_SECRET`).

## Pendências

Lista completa e detalhada em
`docs/OPERATIONS.md#pendências-não-bloqueantes--módulo-saved-search-§43`.
Resumo:

- Sem testes neste lote (pedido explícito).
- Sem frontend/UI para o visitante salvar uma busca — só o backend
  (endpoint, storage, match, e-mail) pedido explicitamente neste lote.
- Sem deduplicação por e-mail/critério (cada "salvar" cria um registro
  novo).
- Limite por IP/dia é best-effort (read-then-write não atômico em R2).
- E-mail de alerta sem fila/retry dedicado além de "a próxima publicação
  desse mesmo anúncio tenta de novo".
- Notificação só no caminho normal de escrita do painel — rebuild em lote
  e suspensão/reativação de corretor não disparam alerta (trade-off da
  decisão 3, hook direto sem cron de reconciliação).
- Match de `type`/`district` é comparação exata, case-sensitive.
- `RESEND_API_KEY` e `SAVED_SEARCH_TOKEN_SECRET` PENDENTES de
  provisionamento (`wrangler secret put`) antes de qualquer chamada real
  a este módulo funcionar.
