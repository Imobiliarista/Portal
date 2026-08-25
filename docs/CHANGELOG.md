# Changelog

## Etapa 9 (lote 8/N) — Módulo feeds: "Modo Exportação" (§90, §46)

Seção "Exportação" no painel do corretor com submódulos independentes —
um por formato/provedor de feed, cada um ligado/desligado separadamente.
Este lote implementa só o submódulo `vrsync` (XML compartilhado por OLX,
ZAP e VivaReal — um único arquivo cobre os três, decisão de produto).
Diferente de todos os módulos client-side desta etapa: o robô de cada
portal busca o arquivo (`feeds/vrsync.xml`) sozinho, sem executar
JavaScript algum — arquivo estático em R2 DATA, gerado pelo Publicador,
servido pelo mesmo Custom Domain que já expõe R2 DATA hoje (§59,
docs/OPERATIONS.md pendência 3). **Nenhuma rota de Worker nova** — sem
push, sem token, sem autenticação (§94/§101, edge-first). Decisões
completas (incluindo as fontes usadas para o XML e o que ficou pendente
de verificação) em `modules/feeds/README.md`.

Este lote passou por duas correções de rumo antes de fechar: a primeira
implementação (formato XML "olx" isolado, reconstruído só via busca) foi
substituída por uma tentativa de JSON estático (spec oficial da OLX,
colada diretamente pelo solicitante) e, por fim, pelo formato final
abaixo — XML VrSync, com "Modo Exportação"/registry de submódulos. O
histórico de commits reflete essa evolução; este changelog documenta só
o estado final.

- `core/validation.js#isZipcode`, `zipcode` novo (opcional) em
  `listing-draft.schema.json`/`listing-public.schema.json#location` —
  pré-requisito descoberto ao implementar: a spec do VrSync exige
  `PostalCode`, e o schema do anúncio nunca teve CEP em lugar nenhum.
  Opcional (não força todo corretor a preencher CEP) — só um anúncio sem
  CEP fica de fora do feed. `business/listings.js`,
  `business/publishing.js#normalizeListingForPublic`,
  `frontend/painel/forms.js`/`render.js` (campo "CEP" no form de anúncio)
  atualizados.
- `storage/keys.js#dataKeys.feed`, `storage/public.js#putPublicText`/`getPublicText`
  (primeiro objeto não-JSON que R2 DATA guarda), `storage/cache.js`
  (`CACHE_TTL_SECONDS.feed`, 1h).
- `broker.modules.feeds` deixou de ser um booleano único e virou um
  objeto por submódulo — `{ vrsync: { enabled } }` — mesmo padrão de
  `broker.modules.publications`, preparado para outras chaves crescerem
  ao lado. `modules/feeds/config.js`: `readFeedSubmoduleConfig`,
  `validateFeedSubmoduleConfig`, `hasAnyFeedSubmoduleEnabled`
  (`schemas/broker.schema.json#modules` já era `additionalProperties: true`
  — nenhuma mudança de schema).
- `modules/feeds/registry.js`: registro dos submódulos —
  `{id, displayName, generate(items, header), fileName, contentType}`.
  Só `vrsync` nesta etapa; um submódulo novo é só uma entrada nova aqui.
- `modules/feeds/formatters/vrsync.js` (renomeado de `olx.js`):
  formatter real, XML VrSync — `ListingID` (o `listingId` PRIVADO, não o
  `slug`), `Title`/`Description` (CDATA), `TransactionType`,
  `ListPrice`/`RentalPrice`, `PropertyType` (tabela best-effort, tipo não
  mapeado exclui o anúncio), `PostalCode` (obrigatório — sem CEP, exclui
  o anúncio), `LivingArea`/`LotArea` (conforme tipo), `Media` (fotos +
  vídeo do YouTube).
- `modules/feeds/generator.js`: `regenerateFeeds` percorre os submódulos
  registrados; `collectFeedItems(env, submoduleId)` recalcula o arquivo
  inteiro a partir do estado privado (mesmo espírito de `rebuildCity`,
  sem particionamento — universo opt-in por submódulo é pequeno). Um
  arquivo agrega TODOS os corretores que ligaram aquele submódulo — não é
  um arquivo por corretor. Só inclui anúncio com projeção pública
  `status: "active"` de corretor `status: "active"` + opt-in nesse
  submódulo — isso já exclui corretor suspenso "de graça" (mesma cascata
  da Etapa 8a).
- `worker/api.js`, `worker/admin.js`: `regenerateFeeds` chamado nos
  pontos onde `business/publishing.js` já é chamado, gated por "o
  corretor afetado tem QUALQUER submódulo habilitado" (evita recompute
  completo em toda escrita de qualquer corretor).
- `frontend/painel/`: nova seção "Exportação" (`/exportacao`, nav
  própria) — lista os submódulos a partir do registry (nunca hardcoded),
  um checkbox por submódulo, um botão salva tudo.
  `scripts/generate-feeds-assets.js` (novo, `npm run generate:feeds`,
  mesmo padrão de outros módulos desta etapa) gera
  `frontend/shared/feeds.generated.js` (metadados `{id, displayName}` +
  `readFeedSubmoduleConfig` — nunca a função `generate`, que é lógica
  server-only).
- `scripts/rebuild-feeds.js` (renomeado de `generate-feeds.js` — nome
  antigo colidia com a convenção `generate:X` = bundle de frontend;
  `npm run rebuild:feeds`, mesmo padrão de `rebuild:listing`/`broker`/`city`)
  — caminho manual/externo, já que nenhum Cron Trigger foi implementado
  neste lote.
- 51 novos testes (`tests/modules/feeds/`, incluindo `registry.test.js`
  novo) — formatter puro com fixtures, config por submódulo, registry, e
  end-to-end sobre `FakeR2Bucket` cobrindo o filtro de quem entra/sai
  (opt-in por submódulo, corretor ativo/suspenso, anúncio
  active/paused/sold/draft, CEP ausente). Suíte completa (476 testes)
  passando, `wrangler deploy --dry-run` validado. Verificado também
  ponta a ponta com `wrangler dev` real (login, `PUT /api/me/profile`
  com `modules.feeds.vrsync`, `feeds/vrsync.xml` gravado corretamente em
  R2 DATA) e visualmente num browser via Playwright (seção Exportação:
  navegação, checkbox refletindo estado, submissão, mensagem de
  sucesso) — nenhum erro de console inesperado.

### Pendências abertas

- `formatters/vrsync.js` foi escrito sem acesso à documentação oficial
  completa (developers.grupozap.com/feeds/vrsync/elements/ ficou
  bloqueada para rede nesta sessão o tempo todo) — a estrutura raiz e a
  lista de campos vieram do solicitante; `PropertyType` (lista completa)
  e o item de vídeo em `<Media>` vieram de WebSearch com exemplos
  citados, não da página em si. Revisar contra a doc real antes de
  produção.
- Só `vrsync` — nenhum outro submódulo de exportação implementado
  (arquitetura pronta para receber um, conforme pedido).
- `Header.Email`/`Header.Telephone` do XML usam placeholders até
  `FEED_CONTACT_EMAIL`/`FEED_CONTACT_PHONE` serem configurados.
- Sem Cron Trigger da Cloudflare (`worker/cron.js` continua placeholder).
- Ordem exata dos elementos dentro de `<Details>` não verificada contra
  o XSD real (VrSync é um schema com sequência — ordem pode importar).

## Etapa 9 (lote 6/N) — Módulo financing-calculator (§90, §44)

Calculadora de financiamento imobiliário 100% client-side, tabela SAC
(Sistema de Amortização Constante) — §44 pede "preferir client-side" e
"se puro frontend, não criar rota Worker desnecessária"; sem rota de
Worker nenhuma foi adicionada. Decisões completas em
`modules/financing-calculator/README.md`.

- `modules/financing-calculator/config.js` (novo): taxa de juros anual
  padrão/faixa aceita, prazo padrão/faixa aceita, entrada mínima (20% do
  valor do imóvel) — só referências de mercado, nada de instituição real.
- `modules/financing-calculator/index.js` (novo): validação por campo,
  `buildSacSchedule` (taxa mensal por conversão composta, convenção
  brasileira), `summarizeSchedule`, `calculateFinancing` (ponto de
  entrada único) e `renderFrontendModuleSource` (mesmo padrão de
  `.toString()` embutido usado por comparison/tour-360/video-youtube).
- `scripts/generate-financing-calculator-assets.js` (novo, `npm run
  generate:financing-calculator`): escreve
  `frontend/shared/financing-calculator.generated.js`.
- `frontend/portal/components/financing-calculator.js` (novo): formulário
  (valor/entrada/taxa/prazo) + resumo + tabela SAC completa colapsável
  ("Ver tabela completa"), montado após `renderListingDetail` sem tocar
  `render.js` (evita import circular).
- Montado tanto no portal quanto no minisite — a página de imóvel
  completo é idêntica nos dois sites (decisão 1 do README).
- `frontend/portal/styles/main.css` e `frontend/minisite/styles/main.css`:
  estilos do formulário/resumo/tabela.

17 novos testes (`tests/modules/financing-calculator/index.test.js`).
Verificado visualmente via `wrangler dev` (prefill do preço, validação
por campo, resumo, tabela expandindo/recolhendo, presente nos dois
sites) — nenhum erro de console.

### Pendências abertas

- Só SAC — sem Tabela Price (parcelas fixas).
- Taxas/prazos são só simulação educativa, sem integração com
  banco/financiadora real.
- Nenhum registro de simulação (analytics/lead) — puramente client-side.

## Etapa 9 (lote 5/N) — Módulo comparison (§90, §45)

Comparação de anúncios lado a lado, 100% client-side — §45 é só três
frases ("Client-side. Browser compara JSONs já carregados. Não precisa
Worker."); o resto (onde a seleção fica guardada, quantos imóveis cabem
lado a lado, quais campos entram na grade) é decisão deste lote,
documentada em `modules/comparison/README.md`.

- `modules/comparison/index.js` (novo): lógica pura testável em Node —
  seleção em `localStorage` (`readComparisonSlugs`/`writeComparisonSlugs`/
  `clearComparisonSlugs`, `storage` injetável, tolerante a storage
  ausente/corrompido), `toggleComparisonSlug` (add/remove respeitando
  `MAX_COMPARISON_ITEMS = 4`) e `buildComparisonRows` (extrai campos
  comparáveis de `listings/{slug}.json` já carregados, §15, valores
  brutos sem formatação).
- `scripts/generate-comparison-assets.js` (novo, `npm run
  generate:comparison`): escreve `frontend/shared/comparison.generated.js`.
- `frontend/portal/components/comparison.js` (novo): botão "+ Comparar"
  no card e no imóvel completo, barra de seleção persistente entre
  rotas, grade lado a lado em `/comparar`. Decora o DOM depois que
  `renderCityView`/`renderListingDetail` já rodaram — `render.js`
  (compartilhado com o minisite) fica intocado, portal-only por design
  (comparar vários imóveis não faz sentido dentro de um minisite de um
  único corretor).
- `frontend/portal/router.js`: nova rota `/comparar`, sem parâmetros — a
  seleção não vai para a URL (é estado do dispositivo/visitante).
- `frontend/portal/app.js`: `renderComparisonRoute` poda slugs órfãos
  (imóvel removido/despublicado, §77); barra montada uma vez fora do
  container que o router recria a cada navegação.
- `frontend/portal/styles/main.css`: estilos do toggle/barra/tabela.

Testes cobrindo a lógica pura e a rota nova; camada de DOM verificada
via `wrangler dev` + Playwright (toggle a partir do card e do imóvel
completo, barra persistindo entre rotas, grade com os 11 campos,
remover/limpar) — nenhum erro de console.

### Pendências abertas

- Sem persistência entre dispositivos/navegadores (§45 descarta Worker).
- `MAX_COMPARISON_ITEMS = 4` é estimativa, não validada com usuário real.
- Sem indicação de "melhor valor por linha" — grade é neutra.

## Etapa 9 (lote 4/N) — Módulo publications (§90, §47)

§47 só define o formato do config no perfil público do corretor
(`modules.publications: {enabled, feedUrl}`) e manda consumir feed
externo no Browser, sem especificar formato de feed nem como `feedUrl`
passa a existir. Decisão de produto confirmada para este lote: fonte é
Blogger/Blogspot — o corretor cola o link do blog no painel e o módulo
descobre o feed Atom uma única vez (padrão
`{origin}/feeds/posts/default`, com fallback de autodiscovery via
`<link rel="alternate" type="application/atom+xml">`); o `feedUrl` já
resolvido é o que fica salvo. Decisões completas em
`modules/publications/README.md`.

- `modules/publications/config.js` (novo): forma/validação de
  `{enabled, feedUrl}` — sem depender de `core/validation.js`, para
  poder ser embutido no bundle client-side sem arrastar `ValidationError`.
- `modules/publications/index.js` (novo): `resolveBloggerFeedUrl`
  (descoberta, roda uma vez no painel) + `parseAtomFeed` (parsing regex
  do Atom, sem `DOMParser` — projeto não tem `jsdom` nem dependência de
  XML) + `renderFrontendModuleSource`.
- `scripts/generate-publications-assets.js` (novo, `npm run
  generate:publications`): escreve
  `frontend/shared/publications.generated.js`.
- `frontend/painel/`: nova seção "Publicações" no formulário de perfil
  (checkbox `enabled` + link do blog); resolve o feed antes de gravar.
- `frontend/minisite/`: busca o feed em paralelo com os imóveis e
  renderiza a seção condicionalmente (só com pelo menos uma entrada) —
  mesmo espírito de "se inexistente, componente não renderiza" (§49).

### Pendências abertas

- CORS do lado do Blogger não verificado em produção.
- Só Blogger é suportado (nenhum outro provedor de blog).
- Sem paginação nem cache do feed no minisite.

## Etapa 9 (lote 3/N) — Módulo tour-360 (§90, §49)

Formaliza `modules/tour-360/` (antes um placeholder): isola o
"componente condicional" do §49 ("campo opcional na projeção pública, se
inexistente componente não renderiza") — antes inline em
`frontend/portal/render.js`. Diferente do `video-youtube` (§50, mesmo
padrão de módulo), o campo `tour360` já chega pronto como `{url}` (sem
`provider`/`id` pra extrair), então não há um `parseXId`/`buildEmbedUrl`
equivalente aqui — só a decisão de quando o link aparece e com que
props (`buildTour360LinkProps`), incluindo `target=_blank`/
`rel=noreferrer` por apontar sempre pra um provider externo.

O campo `tour360` do schema do anúncio (`business/listings.js`,
`business/publishing.js`) já existia desde a Etapa 3 e continua lá, por
§39 (MODULES → BUSINESS, nunca o inverso).

`scripts/generate-tour-360-assets.js` (mesmo padrão do módulo
video-youtube) embute a função testada em
`frontend/shared/tour-360.generated.js`, importado por
`frontend/portal/render.js` (e, por reexportar `renderListingDetail`,
também pelo minisite).

Decisões e pendências completas em `modules/tour-360/README.md`.

## Etapa 9 (lote 2/N) — Módulo video-youtube (§90, §50)

Embed de vídeo do YouTube na página de imóvel completo, a partir do
campo `video: {provider, id}` já existente em
`listing-public.schema.json` (§50) — `parseYoutubeId` (aceita link
completo, `youtu.be`, ou id cru já salvo) + `buildEmbedUrl` +
`renderFrontendModuleSource`, mesmo padrão de geração de asset dos
demais módulos desta etapa.

`buildEmbedUrl` aponta para `youtube-nocookie.com` (modo "privacidade
reforçada"), não `youtube.com`: decisão documentada no README porque
§50 não distingue os dois domínios — o portal é público/indexado e o
visitante nunca deu opt-in de tracking antes de abrir a página do
imóvel.

`scripts/generate-video-youtube-assets.js` (`npm run
generate:video-youtube`) escreve
`frontend/shared/video-youtube.generated.js`, consumido por
`frontend/portal/render.js`.

## Etapa 9 (lote 1/N) — Módulo pwa (§90, §48)

Primeiro módulo real da Etapa 9 (§90 lista `pwa` entre os módulos
iniciais, §40). §48 é só duas frases ("Módulo isolado. Não tornar PWA
dependência do portal."), então a maior parte do trabalho foi resolver
ambiguidade — decisões completas em `modules/pwa/README.md`; resumo:

1. **Escopo = portal público, não minisite/painel/admin.** O manifest é
   config estática (nome "imobiliarista.net"), não dado de corretor —
   aplicá-lo a minisites (origem por corretor) seria semanticamente
   errado neste lote. Minisite/painel/admin ficam de fora, revisitáveis
   depois.
2. **`modules/pwa/manifest.js`** (novo): `PWA_MANIFEST_CONFIG` +
   `buildManifestObject()`, puro, sem I/O.
3. **`modules/pwa/service-worker.js`** (novo): app shell precache
   (`frontend/portal/*`) + cache network-first dos JSONs públicos que
   `frontend/portal/data.js` busca, com TTL de
   `storage/cache.js#CACHE_TTL_SECONDS` (§59-§61) — nunca redigitado.
   `renderServiceWorkerSource()` embute a mesma `CACHE_TTL_SECONDS` e a
   mesma função `classifyJsonRequestKind` testada em Node (via
   `.toString()`), então o código gerado é literalmente o código testado.
4. **`modules/pwa/index.js`** (novo): `registerServiceWorker()`, único
   ponto de contato com o frontend — nunca lança, sempre falha em
   silêncio.
5. **`scripts/generate-pwa-assets.js`** (novo, `npm run generate:pwa`,
   mesmo padrão de `scripts/generate-cities-catalog.js`): escreve
   `frontend/manifest.json` e `frontend/service-worker.js` — Static
   Assets reais, commitados, nunca editados à mão. Workers Static Assets
   só serve `frontend/` (`wrangler.toml`), então esses dois arquivos não
   podiam morar só em `modules/pwa/` sem um passo de geração; nenhuma
   rota de Worker foi adicionada (§94, §73).
6. **`frontend/index.html`**: único ponto tocado no shell do portal — um
   `<link rel="manifest">` + `navigator.serviceWorker.register(...)`
   opcionais, só no host do portal, com `.catch(() => {})`. Se
   `modules/pwa/` for removido, esse trecho falha em silêncio e o portal
   continua 100% funcional (§48).
7. **`frontend/icons/icon.svg`** (novo): único ícone hoje — SVG mínimo
   escrito à mão. Ícones PNG reais (192/512/maskable) ficam como
   pendência antes de um lançamento real.

Nenhuma mudança em `core/`, `business/`, `worker/index.js` ou em qualquer
`app.js` de frontend — `core/` continua sem conhecer `modules/` (§39).

## Etapa 8b — SuperAdmin: planos (§90, §52, §53)

Segunda metade da Etapa 8, separada da 8a (aprovação/suspensão/rebuild)
por decisão do solicitante. Substitui a constante fixa
`PROVISIONAL_MAX_GALLERY_ITEMS` (Etapa 5) por um limite de fotos derivado
do plano real do corretor.

Duas decisões de produto que o documento não cobre foram confirmadas com o
solicitante antes de implementar (ver pendências abertas nesta seção e em
docs/OPERATIONS.md):
1. **Limite de anúncios ativos por corretor**: ficou de fora deste lote —
   não é inventado nem como campo morto no schema. O documento não define
   esse limite em lugar nenhum.
2. **Corretor sem plano atribuído**: em vez de cair só num teto técnico
   solto (que reintroduziria a mesma duplicação de fonte-de-verdade que
   este lote existe para eliminar), o catálogo de planos ganha um plano
   `"free"` semeado automaticamente (50 fotos/anúncio — mesmo valor do
   antigo `PROVISIONAL_MAX_GALLERY_ITEMS`), e todo corretor sem plano
   resolve para ele. Nome/preço/limite reais desse (ou de qualquer outro)
   plano são pendência explícita — ver abaixo.

- `business/plans.js` (novo): domínio privado de planos, mesmo padrão de
  `business/brokers.js` — CRUD (`createPlan`/`updatePlan`/`getPlanById`/
  `listPlans`/`deletePlan`) sobre `plans/{planId}.json` em R2 PRIVATE, mais
  um registro (`indexes/plans.json`) para listar sem varrer o bucket
  (§26). `deletePlan` recusa remover o plano padrão (`DEFAULT_PLAN_ID =
  "free"`) e recusa remover qualquer plano ainda atribuído a algum
  corretor. `assignBrokerPlan(env, brokerId, planId)` é a ação de
  SuperAdmin (§53) que atribui/troca o plano de um corretor — valida que o
  `planId` existe antes de gravar, ao contrário do `plan` livre que
  `createBroker` sempre aceitou (Etapa 3, sem validação contra catálogo
  nenhum — continua assim, ver pendências). `getGalleryLimitForBroker(env,
  brokerId)` é a função nova que resolve "quantas fotos este corretor pode
  ter por anúncio agora": plano atribuído → limite desse plano; sem plano,
  broker não encontrado, ou plano atribuído que não existe mais (deletado,
  ou texto livre de antes deste lote) → semeia/usa o plano `"free"`. Um
  plano nunca deixa de resolver para um número.
- `business/listings.js`: **decisão retroativa sobre a Etapa 5** — removido
  `PROVISIONAL_MAX_GALLERY_ITEMS` e a checagem estática de tamanho da
  galeria em `isValidGallery` (que agora só valida forma: array de URLs).
  `createListing`/`updateListing` chamam
  `business/plans.js#getGalleryLimitForBroker` de forma assíncrona depois
  do `assertValid` e rejeitam com o novo `GalleryLimitExceededError`
  (subclasse de `ListingConflictError`, não mais `ValidationError` — muda
  o código HTTP de 422 para 409 em `PUT /api/me/listings/:id`, ver
  `worker/api.js` abaixo) quando o patch de `gallery` excede o limite do
  plano do corretor dono do anúncio.
- `worker/uploads.js`: **muda um arquivo da Etapa 5 já mesclado** — o
  check de "galeria cheia" em `POST /api/me/media` não lê mais
  `PROVISIONAL_MAX_GALLERY_ITEMS` (removida); consulta
  `getGalleryLimitForBroker(env, listing.brokerId)` antes de aceitar o
  upload. Também passa a tratar `GalleryLimitExceededError` vindo de
  `updateListing` (defesa contra corrida entre o pré-check e a escrita em
  duas requisições concorrentes) com o mesmo 409 do pré-check.
- `worker/api.js`: `handlePutListing` ganhou um catch para
  `ListingConflictError` (cobre o novo `GalleryLimitExceededError`) — antes
  esse handler só tratava `ListingNotFoundError` e deixava tudo o mais cair
  no 500 genérico central; `handleCreateListing` já tratava
  `ListingConflictError` desde a Etapa 3, nada mudou lá.
- `worker/admin.js`: novas rotas `/api/admin/plans*` (CRUD, atrás de
  `requireSuperadmin` como todo o resto deste arquivo) e
  `PUT /api/admin/brokers/:id/plan` (atribuir/trocar plano — verbo PUT,
  não POST, por ser "definir um recurso" e não uma ação tipo
  aprovar/suspender, mesma convenção de `PUT /api/me/profile`).
- `storage/keys.js`/`storage/indexes.js`: `privateKeys.plan(planId)`
  (`plans/{planId}.json`), `privateKeys.planRegistry()`
  (`indexes/plans.json`), e o registro correspondente
  (`getKnownPlanIds`/`registerPlanId`/`deregisterPlanId`) — este último é
  o único registro do projeto que de fato remove entradas (`deletePlan`),
  ao contrário do registro de corretores/cidades, que só cresce.
- `schemas/plan.schema.json` (novo): shape de `plans/{planId}.json`. Sem
  projeção pública — plano é um dado só-admin nesta etapa (Etapa 10/Asaas é
  quem eventualmente precisaria expor algo ao público, se precisar).
- `frontend/admin/{data,render,brokers,plans,app}.js`: nova seção
  "Planos" (listar/criar/editar/remover) e a coluna "Plano" da tabela de
  corretores virou um `<select>` que atribui na hora (`onChange`, sem
  botão "salvar" separado) em vez de texto estático. `frontend/admin/app.js`
  é quem sincroniza as duas seções — a lista de planos que
  `frontend/admin/plans.js` mantém também alimenta o `<select>` de
  `frontend/admin/brokers.js`, via um `onPlansChanged` que a seção de
  planos chama depois de qualquer mutação bem-sucedida.
- 40 novos/alterados testes: `tests/business/plans.test.js` (novo — CRUD,
  seed do plano padrão, `assignBrokerPlan`, `getGalleryLimitForBroker`),
  `tests/business/listings.test.js` (troca os testes do teto fixo por
  testes do limite vindo do plano, incluindo um corretor com plano acima
  de 50), `tests/security/admin-api.test.js` (rotas `/api/admin/plans*` e
  `/api/admin/brokers/:id/plan`, incluindo o gate de superadmin),
  `tests/storage/keys.test.js`/`tests/storage/indexes.test.js` (chaves e
  registro de plano).

### Pendências abertas (ver também docs/OPERATIONS.md)

- **Catálogo real de planos**: nomes, preços e limites de planos reais
  (além do `"free"` semeado com 50 fotos/anúncio) não foram inventados —
  são decisão de produto do solicitante. A estrutura de CRUD já suporta
  criá-los via `POST /api/admin/plans` assim que a decisão existir.
- **Limite de anúncios ativos por corretor**: fora de escopo por decisão
  explícita — o documento não define esse limite; nenhum campo foi
  adicionado ao modelo de plano para evitar um campo que pareceria
  funcionar sem funcionar.
- **`createBroker`'s `plan` field**: continua texto livre, não validado
  contra o catálogo de planos (não há rota de criação de corretor que
  precisasse disso — ver pendência da Etapa 8a). `assignBrokerPlan` é o
  único caminho que garante `broker.plan` apontando para um plano real.
- **Cobrança/Asaas**: Etapa 10, como já estava previsto — este lote é só a
  estrutura de dados do plano e o limite técnico que ele impõe.

## Etapa 8a — SuperAdmin: aprovação/suspensão + rebuild manual (§90, §53, §55, §72)

Fecha a pendência aberta desde a Etapa 4: até este lote, um corretor
suspenso continuava conseguindo logar normalmente. Escopo dividido em 8a
(este PR) e 8b (planos, PR separado) por decisão explícita do solicitante —
o escopo original da Etapa 8 (aprovação/suspensão + planos + rebuild manual
+ frontend admin) era grande demais para um único PR coerente.

- `business/brokers.js`: `approveBroker`/`suspendBroker`/`reactivateBroker`
  (transições de status validadas — pending→active, active/pending→suspended,
  suspended→active) e `listBrokers` (lista todos os corretores, com filtro
  opcional por status). Novo `BrokerStatusError` (subclasse de
  `BrokerConflictError`). O enum de status (`pending`/`active`/`suspended`/
  `disabled`) já existia desde o Lote 3 — nada novo aqui, só as transições.
- `business/auth.js#login`: fecha a pendência da Etapa 4 — rejeita
  `suspended`/`disabled` com o mesmo `InvalidCredentialsError` genérico já
  usado para credencial errada (nunca revela que a conta existe e está
  suspensa). `pending` continua podendo logar — nada no documento sugere
  bloquear um corretor ainda não aprovado de usar o painel enquanto espera.
- `worker/auth.js#requireTenant`: sessões são stateless (§28, sem revogação
  server-side) — um corretor suspenso *depois* de já ter um cookie válido
  continuaria usando `/api/me/*` até o token expirar. `requireTenant` agora
  reconfirma o status do corretor a cada request privada (pulado para
  sessão superadmin).
- `business/publishing.js`: decisão de produto confirmada com o solicitante
  antes de implementar (o documento só define isso para o perfil do
  corretor, §76, não para os anúncios) — anúncios de um corretor
  suspenso/disabled somem do shard/index da cidade (mesmo tratamento que
  paused/sold/removed), mas `listings/{slug}.json` continua existindo
  (§64, nunca 404 silencioso) com status `"suspended"` — valor que
  `listing-public.schema.json` já reservava desde antes desta etapa, sem
  nenhum caminho de código que o produzisse até agora. Novo
  `republishBrokerListings` aplica isso de imediato nos anúncios já
  publicados no momento da suspensão/reativação (não só na próxima edição
  individual de cada anúncio) — reaproveita `publishListing`, não
  reimplementa nada. Um anúncio independentemente sold/removed/paused
  mantém esse status mais específico.
- `storage/keys.js`/`storage/indexes.js`: novo registro `brokerRegistry`
  (`indexes/brokers.json` → `{ brokerIds }`), mesmo padrão do
  `cityRegistry` da Etapa 6/7 — necessário porque §72 lista rotas de admin
  mas nenhum mecanismo de listar todos os corretores sem varrer o bucket
  (§26) existia ainda.
- `worker/admin.js`: implementado (era placeholder desde o Lote 1).
  `GET /api/admin/brokers` (+ `?status=`), `POST .../approve`,
  `POST .../suspend`, `POST .../activate`, `POST .../publish` (§53
  "republicar corretor" — força republicação do perfil + todos os anúncios
  do corretor), `POST /api/admin/rebuild/city/:city`,
  `POST /api/admin/rebuild/all` (§53 "rebuild cidade"/"rebuild global" —
  só expõe `business/publishing.js#rebuildCity`/`rebuildAll`, já existentes
  desde a Etapa 6/7, nenhuma lógica de rebuild nova). Todas as rotas atrás
  de `requireSuperadmin` (`core/permissions.js`, existente desde a Etapa 4,
  primeira vez de fato usado por uma rota real).
  **Fora do escopo deste lote** (§72 lista, mas a tarefa não pediu):
  `POST /api/admin/brokers` (criar corretor) e
  `GET`/`PUT /api/admin/brokers/:id` (edição livre) — ver pendências.
- `frontend/index.html`: roteamento por hostname (§74) ganha o branch
  `admin.imobiliarista.net` (+ `?app=admin` em dev), que nunca tinha sido
  ligado — sem isso, o host admin caía silenciosamente no portal.
  `frontend/admin/index.html` (placeholder do Lote 1, nunca servido de
  fato — nem painel/portal/minisite têm um `index.html` próprio, só o da
  raiz) removido por já estar morto/enganoso.
- `frontend/admin/{data,render,brokers,publishing,app}.js` (novos +
  antigos placeholders implementados): login (reaproveita
  `POST /api/auth/login`, com uma checagem de papel puramente client-side —
  a real é `requireSuperadmin` no Worker), lista de corretores com
  aprovar/suspender/reativar/republicar, e botão de rebuild manual (por
  cidade ou geral, com continuação do lote via `nextCursor`). `styles/main.css`
  novo (mesma convenção minimalista de `frontend/painel/styles/main.css`).
  `frontend/admin/listings.js` continua placeholder — gestão de imóveis via
  admin não fazia parte do escopo pedido para este lote.
- 32 novos testes: `tests/business/brokers.test.js` (transições de status +
  `listBrokers`), `tests/business/auth.test.js` (login bloqueado para
  suspended/disabled, permitido para pending), `tests/publishing/publishing.test.js`
  (cascata de suspensão/reativação sobre anúncios já publicados),
  `tests/security/painel-api.test.js` (corretor suspenso mid-sessão perde
  `/api/me/*` na próxima request), `tests/security/admin-api.test.js`
  (novo — todas as rotas `/api/admin/*`, incluindo o gate de superadmin).

### Pendências abertas (ver também docs/OPERATIONS.md)

- **Criação de corretor**: não há rota (`POST /api/admin/brokers`, listada
  em §72) nem fluxo de autocadastro público — `business/brokers.createBroker`
  só é exercitado por testes/scripts hoje. "Aprovar cadastro pendente"
  pressupõe que um corretor `pending` já existe; como ele passa a existir
  fica para um lote futuro (§53 lista "criar corretor" como função do
  SuperAdmin, mas a tarefa deste lote não pediu essa rota).
- **`"disabled"`**: existe no enum de status desde o Lote 3 e o publicador
  já trata como suspensão para fins públicos/login, mas nenhuma rota admin
  o produz neste lote (só `pending`/`active`/`suspended` são alcançáveis
  via `/api/admin/brokers/:id/*`). Documentado como decisão consciente, não
  esquecimento — ver `business/brokers.js`.
- **Etapa 8b (planos)**: gestão de planos (CRUD, atribuir a corretor,
  possível migração de `PROVISIONAL_MAX_GALLERY_ITEMS` para limite
  por-plano) fica para um PR separado, por decisão do solicitante.
- **Provisionamento do primeiro superadmin**: sem rota de criação (ver
  acima), a primeira conta superadmin só pode ser criada hoje chamando
  `business/brokers.createBroker` + `business/auth.setAuthPassword(..., {
  role: "superadmin" })` diretamente (script/console), não por uma rota
  HTTP. Ver docs/OPERATIONS.md.

## Etapa 7 — Escala (§90, §7-9, §32-36)

O Publicador (Etapa 6) assumia implicitamente shard único por cidade
(`dataKeys.cityShard(slug, 1)` hardcoded). Este lote remove essa suposição:
cidades agora particionam de verdade quando ultrapassam 300 cards OU ~1MB
comprimido (§9), o que vier primeiro.

- `business/sharding.js` (novo): lógica pura de particionamento —
  `cardFitsInShard`/`partitionCardsIntoShards`/`estimateCompressedSize`.
  Sem R2 aqui, testável isoladamente (`tests/business/sharding.test.js`).
  `estimateCompressedSize` só roda `CompressionStream("gzip")` de verdade
  quando o JSON descomprimido já ultrapassa o alvo de 1MB — abaixo disso, a
  compressão de JSON textual normal só encolhe, então o tamanho
  descomprimido já garante que cabe (evita rodar gzip em toda publicação
  de uma cidade pequena, que é o caso comum).
- `business/publishing.js`: reescrito `applyCardToCity`/`touchCityManifest`
  e adicionado `findOrCreateShardForNewCard`. Decisões (documentadas no
  cabeçalho do arquivo, decisão 4):
  - **Atribuição de shard é sticky por anúncio.** Novo campo no manifest
    privado do anúncio, `publishedShard` — registra em qual shard da
    cidade atual o card está. Editar um anúncio já publicado atualiza o
    card **no mesmo shard**, nunca move para outro, mesmo que o shard
    cresça um pouco além do alvo de 1MB nesse processo. O limite do §9 é
    sobre abrir um shard novo, não sobre nunca deixar um existente crescer
    por causa de uma edição in place.
  - **Card novo sempre tenta o último shard da cidade primeiro**; se não
    couber, abre um shard novo. Nunca faz backfill em shards anteriores que
    sobraram com espaço por remoções — mesma filosofia monotônica já usada
    pelo registro de cidades (`storage/indexes.js#registerCitySlug`):
    simplicidade (§94) em vez de reempacotamento perfeito.
  - **`manifest.shards` é monotônico** na publicação incremental — só
    cresce (um shard esvaziado por remoções continua listado). Renumerar
    quebraria `publishedShard` de outros anúncios apontando pro mesmo
    número. Só `rebuildCity` pode encolher essa lista.
  - **Fallback defensivo**: se `publishedShard` estiver desatualizado (ex.:
    a cidade foi reparticionada por `rebuildCity` sem essa gravação ter
    chegado por algum motivo) e o card não for encontrado no shard
    indicado, o publicador trata como inserção nova em vez de travar ou
    silenciosamente não fazer nada.
- `business/publishing.js#rebuildCity`: agora reparticiona de verdade
  (`partitionCardsIntoShards`) em vez de gravar tudo em `001.json` com um
  `console.warn` acima de 300 cards. Também sincroniza `publishedShard` de
  cada anúncio processado com o resultado do reparticionamento, e apaga
  explicitamente arquivos de shard que sobraram de uma contagem anterior
  maior (cidade encolheu) — nunca deixa `NNN.json` órfão apontando pra
  nada.
- `rebuildAll` (§34): sem mudança de comportamento — continua processando
  em lotes por cidade (não por shard individual), o que já é mais
  conservador que "100 shards por lote" sugere, não menos; comentário
  atualizado só porque a premissa antiga (cidade == 1 shard) não vale mais.
- Jobs/Queue (§35-36): sem mudança — nenhum sinal de volume que justifique
  Queue; permanece execução síncrona/direta (decisão já tomada na Etapa 6,
  revalidada aqui).
- **Nenhuma mudança de schema.** `city-manifest.schema.json` (`shards` já
  array), `city-index.schema.json` (`shard` já sem limite superior) e
  `city-shard.schema.json` (`maxItems: 300` já presente) já previam
  múltiplos shards desde o Lote 1. `frontend/portal/data.js`/`filters.js`
  (Lote 2) também já eram agnósticos à contagem de shards — já buscavam
  shard por número e já usavam `shardsNeededForFilters` sobre o índice
  compacto para decidir quais shards buscar. Confirmado com um teste de
  integração dedicado
  (`tests/frontend/portal/multi-shard-read.test.js`) em vez de qualquer
  mudança de código no frontend.
- 16 novos testes: `tests/business/sharding.test.js` (particionamento puro
  — limite por contagem, limite por tamanho comprimido usando conteúdo de
  alta entropia pra cruzar ~1MB com poucos cards, caso vazio),
  `tests/publishing/sharding.test.js` (publicação real que força um shard
  novo ao passar de 300 cards + atribuição sticky, regressão de cidade
  pequena em shard único, `rebuildCity` reparticionando/encolhendo uma
  cidade com limpeza do shard órfão) e
  `tests/frontend/portal/multi-shard-read.test.js` (leitura via
  `data.js`/`filters.js` reais contra fixtures de uma cidade de 2 shards).
- Pendências explícitas, fora do escopo deste lote (Etapa 8):
  - Telas de SuperAdmin para monitorar tamanho de shard ou disparar
    reparticionamento manual — `rebuildCity`/`rebuildAll` continuam só CLI
    (`scripts/rebuild-*.js`), sem rota `/api/admin/rebuild/*` exposta
    (mesma pendência já registrada na Etapa 6).
  - Particionamento de listagens de corretor (§17 "mesma regra pode ser
    reutilizada") não foi tocado — fora do escopo explícito deste lote
    (só particionamento de cidade, §7-9). `brokers/{slug}/listings.json`
    continua um arquivo único.
  - Sem compactação/reempacotamento automático de shards esparsos — uma
    cidade que perde muitos anúncios por remoção só volta a ocupar menos
    shards quando alguém roda `rebuildCity`/`rebuildAll` explicitamente
    (nenhum gatilho automático foi pedido nem adicionado).

## Etapa 6 — Publicador (§90, §29-37, §64)

Primeira vez que um anúncio criado no painel (Etapa 5) passa a existir de
fato no portal público (Etapa 2) — até aqui, tudo que a Etapa 2 lia em R2
DATA era fixture de teste.

- `business/publishing.js` (novo, era placeholder): o publicador —
  `publishListing`, `publishBroker`, `rebuildListing`, `rebuildBroker`,
  `rebuildCity`, `rebuildAll`. `publishListing` é chamado pelo Worker toda
  vez que o corretor salva/edita (§32) e faz upsert incremental — só o
  shard único da cidade afetada é regravado (lido, filtrado por id,
  regravado), nunca a cidade inteira; `rebuildCity` é o caminho que
  descarta e recalcula um shard/index/manifest do zero a partir do estado
  privado (§33), usado por divergência, não pelo fluxo normal de edição.
- `business/cards.js` (novo, era placeholder): `buildListingCard`/
  `buildIndexEntry`, mapeamento puro listing-public → card (§13) → entrada
  de índice (§21). `id` do card é o `listingId` privado (§13 já mostra esse
  formato no exemplo) — listing-public.schema.json não tem id nenhum, só
  `slug`.
- `business/cities.js` + `business/data/cities-catalog.generated.js`
  (novos): `city-manifest.schema.json` exige `city.name`/`city.uf`, mas o
  draft do anúncio (Lote 3) só guarda `city` como slug livre, sem UF em
  lugar nenhum do sistema. Decisão (após confirmar com o usuário): catálogo
  estático nacional de municípios gerado uma única vez a partir da API de
  Localidades do IBGE (`scripts/generate-cities-catalog.js`, não chamado em
  runtime), não uma tabela inventada nem um novo campo no draft do Lote 3.
  **Pendência bloqueante**: esta sessão de trabalho não tinha rede liberada
  para `servicodados.ibge.gov.br` (bloqueio de política do ambiente,
  confirmado via `/__agentproxy/status` — não contornável); o arquivo
  gerado commitado é só uma amostra pequena (4 cidades reais + um par
  sintético para exercitar o desempate de slug por UF), marcada como
  placeholder no próprio cabeçalho. Rodar `node
  scripts/generate-cities-catalog.js` (rede liberada) e commitar o
  resultado real (~5.570 municípios) é pré-requisito para deploy — uma
  cidade fora do catálogo é `UnknownCityError`, nunca um name/uf inventado.
- Mapeamento de status (decisão, documentada no cabeçalho de
  `business/publishing.js`): o draft do anúncio tem 5 estados
  (draft/active/paused/sold/removed) e listing-public.schema.json tem
  outros 5, só 3 em comum. Única correspondência não-arbitrária dado os
  enums: `paused → inactive`, `draft → null` (ainda não publicado). Mesma
  lógica para corretor: `pending → null` (não aprovado), `disabled →
  suspended` (broker-public.schema.json não tem estado "disabled").
- Card só existe no shard/index para status público `active` (o card não
  tem campo status nenhum, §13/§14 — é implicitamente sempre ativo).
  `sold`/`removed` saem do shard mas `listings/{slug}.json` continua
  existindo com o status explícito (§64) — nunca 404 silencioso. Uma
  listagem que nunca foi `active` (draft → sold direto, por exemplo) nunca
  ganha um tombstone público: não havia link nenhum pra preservar.
- Caso de borda fora do documento: anúncio já publicado que volta pra
  `status: "draft"` (`business/listings.js#updateListing` permite essa
  transição). Decisão conservadora: o card sai do shard/index, mas
  `listings/{slug}.json` NÃO é reescrito (fica com o último status público
  válido) — listing-public.schema.json não tem um valor "draft".
- Gap descoberto (não decisão desta etapa — cruza Lote 1/Lote 3):
  `business/listings.js` não exige `district` na criação do anúncio, mas
  `listing-public.schema.json` exige `location.district` (minLength 1).
  `publishListing` recusa publicar nesse caso (`PublishValidationError` —
  validação estrutural leve própria, sem ajv, §94) em vez de gravar um
  district vazio. `business/listings.js` provavelmente deveria exigir
  `district` na criação — não alterado aqui, fora do escopo deste lote.
- Índices privados novos em `storage/indexes.js` (mesmo padrão de
  `getBrokerListingIds`): `getCityListingIds`/`addCityListingId`/
  `removeCityListingId` (`indexes/cities/{city}/listings.json` — para
  `rebuildCity` achar os anúncios de uma cidade sem varrer `listings/`,
  §26) e `getKnownCitySlugs`/`registerCitySlug` (`indexes/cities.json` —
  para `rebuildAll` enumerar cidades sem varrer `indexes/cities/`).
- `worker/api.js`/`worker/uploads.js`: toda rota que já mutava estado
  privado do anúncio/corretor agora também chama o publicador depois
  (create/update/delete de anúncio, update de perfil, upload/remoção de
  foto de galeria e de logo/capa — capa é um gatilho explícito do §32).
  Todas essas chamadas são no-op segura para um draft/perfil ainda não
  publicável (draft/pending) — `shouldPublish` em
  `business/publishing.js`.
- Jobs/Queue (§35-36): execução síncrona/direta, decisão documentada. Não
  há sinal de volume que justifique Queue (§94); a única "fila" real é o
  cursor de `rebuildAll`, persistido em R2 PRIVATE
  (`jobs/rebuild-all/checkpoint.json`), não uma Cloudflare Queue.
- `scripts/rebuild-listing.js`/`rebuild-broker.js`/`rebuild-city.js`/
  `rebuild-all.js` (eram placeholders): CLIs finos sobre
  `business/publishing.js`, usando `getPlatformProxy` do próprio wrangler
  (já devDependency) para os bindings reais de R2 a partir de
  `wrangler.toml` — nenhuma credencial de R2 nova, nenhum código de acesso
  a bucket fora de `storage/` (§93). `rebuild-all.js` aceita `--all`
  (processa lotes até terminar) e `--batch-size=N`; sem `--all`, roda um
  lote e para, retomando do checkpoint na próxima chamada (§34).
- Shard único por cidade nesta etapa (decisão explícita do escopo, §90):
  particionamento por 300 cards/1MB fica pra Etapa 7. A estrutura
  (`manifest.shards` como array, `dataKeys.cityShard(slug, N)`) já é
  compatível com múltiplos shards.
- Não implementado, pendência explícita: cron (§37) — nenhum trigger
  periódico automático foi adicionado; `rebuildAll` existe e funciona, mas
  precisa ser chamado manualmente (CLI) ou por uma futura rota
  SuperAdmin/cron. Telas de SuperAdmin para disparar rebuild continuam
  Etapa 8.
- 46 novos testes: `tests/publishing/publishing.test.js` (publicação
  incremental só toca o shard certo, manifest com `publicationVersion`
  incrementado, remoção/vendido sem quebrar o link, mudança de cidade,
  regressão pra draft, `publishBroker`/`rebuildBroker`, e um teste de
  rebuild completo que corrompe o shard público e reconstrói o mesmo
  estado a partir do privado, mais batching/checkpoint/idempotência de
  `rebuildAll`), `tests/business/cards.test.js`,
  `tests/business/cities.test.js`, mais 2 testes ponta a ponta novos em
  `tests/security/painel-api.test.js` provando a integração
  Worker→publicador→R2 DATA de verdade (o "cabeçalho" deste lote).

## Etapa 5 — Painel (§90, §54, §56-57)

- `worker/api.js` (novo, era placeholder): `/api/me/profile` (GET/PUT),
  `/api/me/listings` (GET/POST), `/api/me/listings/:id` (GET/PUT/DELETE).
  Toda rota chama `requireTenant` primeiro e nunca reimplementa CRUD — só
  costura `business/brokers.js`/`business/listings.js` (Etapa 3) a
  respostas HTTP. `DELETE` é soft-delete: `updateListing(..., {status:
  "removed"})`, reaproveitando o enum de status já existente — nenhuma
  função nova em `business/listings.js`. Acesso cross-tenant (leitura ou
  escrita) é bloqueado do mesmo jeito em toda rota: `TenantMismatchError`
  → 403, tratado centralmente por `core/app.js` (mesmo mecanismo já usado
  nas Etapas 3-4), não um 404 disfarçado.
- `worker/uploads.js` (novo, era placeholder): `POST /api/me/media` e
  `DELETE /api/me/media/:id`. Aceita três `target`: `listing-gallery`
  (exige `listingId`, valida posse via `assertTenantMatch`, escreve a URL
  resultante no `gallery` do draft via `updateListing`), `broker-logo` e
  `broker-cover` (slot único, sobrescrito a cada upload, grava direto em
  `business/brokers.js#updateBrokerProfile`). O `id` devolvido para
  DELETE é a própria chave do R2 MEDIA, codificada em base64url — não foi
  criado nenhum índice novo só para mapear id→chave (§93).
- `storage/media.js`: **decisão retroativa sobre a Etapa 1** — removido o
  suporte a `video/mp4`/`video/webm`. Vídeo nunca foi um upload: é sempre
  um link do YouTube (§50, campo `video` do draft, já validado em
  `business/listings.js` desde a Etapa 3). Manter os tipos de vídeo no
  validador deixaria uma porta de upload funcional de até 200MB que nunca
  deveria existir. `storage/keys.js#mediaKeys.listingVideoItem` (só usado
  por esse caminho) também foi removido.
- `business/listings.js`: novo `PROVISIONAL_MAX_GALLERY_ITEMS = 50`,
  aplicado em `isValidGallery`. A arquitetura não define quantidade
  máxima de mídia por anúncio — isso é derivado do plano do corretor
  (§52, Etapa 10/Financeiro, que ainda não existe). Este é só um teto
  técnico provisório até o sistema de planos existir, não uma decisão de
  produto.
- `frontend/painel/` (era placeholder desde a Etapa 1): SPA completa —
  login, editar perfil (+ upload de logo/capa), listar/criar/editar/
  excluir anúncio, upload/remoção de fotos da galeria, tratamento de
  sessão expirada (401 em qualquer chamada → volta pro login). Mesma
  convenção de `frontend/portal/`/`frontend/minisite/` (JS puro, sem
  framework, `mount(container)`, `el()` helper) mas falando com
  `/api/me/*` via `fetch(..., {credentials:"same-origin"})` em vez de ler
  R2 DATA direto — é o lado privado do fluxo do §2, não o público.
  `frontend/index.html` ganhou o roteamento por hostname para
  `painel.imobiliarista.net` (o host já estava reservado desde a Etapa 2)
  mais um escape hatch `?app=painel` em localhost para dev, mesmo padrão
  do `window.__IMOB_DATA_BASE_URL__` do portal. `frontend/painel/index.html`
  (placeholder morto — nunca era servido; nem `portal/` nem `minisite/`
  têm um `index.html` próprio, só o `frontend/index.html` raiz) foi
  removido.
- Sem campo de slug no formulário de criação de anúncio: é derivado do
  título automaticamente (§30, imutável após criar). Pendência conhecida
  — ver PR.
- 18 novos testes de API (`tests/security/painel-api.test.js`, mesmo
  padrão ponta a ponta de `tests/security/auth-flow.test.js`: handler
  chamado direto contra `FakeR2Bucket` + cookie de sessão real) cobrindo
  sucesso, 401 sem sessão, e bloqueio cross-tenant em leitura/escrita de
  listing e em upload/delete de mídia. Mais testes ajustados para a
  remoção de vídeo (`tests/storage/media.test.js`) e para o teto de
  galeria (`tests/business/listings.test.js`). Fluxo completo (login →
  editar perfil → criar anúncio → upload de foto → excluir → sessão
  expirada) verificado manualmente via `wrangler dev` + Playwright.

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
