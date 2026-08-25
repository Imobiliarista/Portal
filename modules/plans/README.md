# Módulo: plans

Ver §52 (e §38-§40, §53, §90) de
`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`. §52 é só a árvore
de arquivos do módulo (`index.js`, `catalog.js`, `eligibility.js`,
`features.js`, `README.md`) + uma frase — "Não espalhar checks de plano
por toda base."

## Onde vive o quê

O schema/CRUD real do plano (`plans/{planId}.json` em R2 PRIVATE) mora em
`business/plans.js` desde a Etapa 8b — este lote (Etapa 10) só amplia esse
arquivo (preço mensal/implantação, limite de anúncios ativos, mapa de
módulos inclusos), sem recriá-lo. `modules/plans/` é a camada de consulta
que fica por cima:

- `catalog.js` — reexport fino de `listPlans`/`getPlanById`/
  `getPlanForBroker`/`DEFAULT_PLAN_ID`/`PLAN_MODULE_KEYS`, para outros
  módulos importarem daqui em vez de `business/plans.js` diretamente.
- `features.js` — metadados de exibição (`{key, label}`) para as chaves
  de `business/plans.js#PLAN_MODULE_KEYS`, a lista canônica (vive em
  `business/` porque §39 proíbe `business/` de depender de `modules/`).
- `eligibility.js` — "esse corretor tem módulo X no plano dele?"
  (`isModuleEnabledForBroker`/`getEnabledModulesForBroker`), a peça que
  §52 pede para centralizar.
- `index.js` — agrega os três acima.

## Módulos incluídos no plano: decisão sobre quais são toggle

`business/plans.js#PLAN_MODULE_KEYS` só tem `publications` (§47) e
`feeds` (§46). Os outros módulos da Etapa 9 foram avaliados e ficaram de
fora, por module:

- **appointments** (§41) — formulário de contato geral, sem nenhuma
  estrutura `broker.modules.appointments` (nem persistência em R2, ver
  `modules/appointments/README.md`). Nada para "ligar/desligar" — o
  módulo inteiro roda client-side reaproveitando `broker.whatsapp`.
- **tour-360** (§49) / **video-youtube** (§50) — campos opcionais do
  *anúncio* (`listing.tour360`/`listing.video`), não do corretor. Não há
  toggle de módulo por corretor a gatear; gatear exigiria mudar
  `business/listings.js`, fora do que foi pedido.
- **comparison** (§45) / **financing-calculator** (§44) — 100%
  client-side, sem nenhuma associação a um corretor específico (o
  visitante compara/simula, não o corretor que "tem" o módulo).
- **saved-search** (§43) — visitante público sem login, sem
  `brokerId`/tenant em lugar nenhum do desenho (ver
  `modules/saved-search/README.md`, decisão 1). Não há "corretor dono"
  para checar elegibilidade.
- **pwa** (§48) — módulo isolado do portal inteiro, não por corretor.
- **ai-search** (§42) e **financial** (§51) — ainda placeholders, nada
  implementado para gatear.

Se um desses módulos ganhar uma estrutura `broker.modules.<x>` real no
futuro, adicionar a chave em `PLAN_MODULE_KEYS` é aditivo — nenhuma
migração necessária nos planos já existentes.

## Pendência: eligibility.js não está conectado a nada

`isModuleEnabledForBroker`/`getEnabledModulesForBroker` existem e
funcionam (leem `plan.modules` via `getPlanForBroker`), mas **nenhum
outro módulo os chama ainda**. `modules/publications` e `modules/feeds`
continuam exatamente como estavam antes deste lote: qualquer corretor
pode ligar `publications`/`feeds` no próprio perfil, independente do que
o plano dele diz em `modules`. Conectar essas duas peças é uma decisão de
produto explicitamente deixada para depois deste lote — mudar isso agora
alteraria o comportamento de dois módulos já em produção sem confirmação
prévia do solicitante. Idem para `business/plans.js#getActiveListingLimitForBroker`
(o resolvedor do limite de anúncios ativos): existe, mas
`business/listings.js#createListing` não o chama — sem enforcement neste
lote.
