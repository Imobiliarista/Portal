# Módulo: feeds — "Modo Exportação"

Ver §46 (e §38-§40, §67, §90, §94, §101) de
`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`. §46 é só a árvore
de arquivos do módulo (`index.js`, `registry.js`, `formatters/`,
`generator.js`, `README.md`) + uma frase — "Exports ficam no R2" — sem
definir onde o robô do portal externo busca o arquivo, se é opt-in por
corretor, nem o formato exato de cada feed. Este README documenta o que
preencheu essa ambiguidade, confirmado com o solicitante ao longo de
várias rodadas antes deste lote fechar (ver `docs/CHANGELOG.md` para o
histórico de correções de rumo — o formato passou por duas revisões
antes deste texto).

## Diferença em relação aos módulos anteriores da Etapa 9

`appointments`, `comparison`, `financing-calculator`, `publications`,
`pwa`, `tour-360`, `video-youtube` são todos client-side puros (ou não têm
nada para persistir) — o browser do visitante já está lá, executando
JavaScript. `feeds` é o primeiro módulo consumido por um **robô de
portal externo** (OLX/ZAP/VivaReal), que faz uma requisição HTTP direta
a uma URL esperando um arquivo — não executa JavaScript, não pode
depender do Browser montar nada. `modules/feeds/generator.js` é também o
primeiro módulo desta etapa que toca R2/business diretamente no servidor
(§39 permite essa direção, MODULES -> BUSINESS -> CORE -> STORAGE).

## "Modo Exportação": arquitetura de submódulos

Decisão de arquitetura confirmada: uma seção no painel do corretor
("Exportação") com **submódulos independentes**, um por formato/provedor
de feed, cada um ligado/desligado separadamente. Este lote implementa só
o submódulo **`vrsync`** — o XML compartilhado por OLX, ZAP e VivaReal
(todos Grupo OLX hoje): **um único arquivo cobre os três**, não um
arquivo por portal. Um submódulo futuro (um formato específico de outro
provedor) só precisa de uma entrada nova em `modules/feeds/registry.js`
— nem `generator.js` nem o componente de listagem do painel
(`frontend/painel/render.js#renderExportForm`) precisam mudar.

Cada entrada do registry expõe:
- `id` — chave estável; também a chave em `broker.modules.feeds` e (via
  `fileName`) o nome do arquivo em R2 DATA.
- `displayName` — rótulo mostrado no painel.
- `generate(items, header)` — função pura, devolve o conteúdo do arquivo
  (string). `items` já vêm filtrados (publicado, corretor ativo,
  submódulo habilitado) por `generator.js#collectFeedItems`.
- `fileName` — nome do arquivo em R2 DATA (`storage/keys.js#dataKeys.feed`
  monta `feeds/{fileName}.xml` — sempre `.xml` hoje; um submódulo não-XML
  futuro precisaria de um pequeno ajuste ali).
- `contentType` — gravado no objeto R2.

**Um arquivo agrega TODOS os corretores que ligaram aquele submódulo —
não é um arquivo por corretor.** Confirmado como a leitura correta de
como portais brasileiros normalmente recebem feed (nível de
imobiliária/conta integradora, não por corretor individual) — coerente
com a doc oficial da OLX (`Importação de Anúncios via Arquivo JSON`),
que fala em "o anunciante disponibiliza uma URL" (singular, por conta),
nunca uma URL por corretor de uma mesma imobiliária.

## Decisões tomadas

1. **Onde o feed fica disponível: arquivo estático em R2 DATA, não uma
   rota de Worker.** `feeds/vrsync.xml`, escrito por
   `generator.js#regenerateFeeds` via `storage/public.js#putPublicText`
   (nova função — primeiro objeto não-JSON que R2 DATA guarda;
   `putPublic`/`getPublic` sempre fizeram `JSON.stringify`/`.json()`) e
   servido pelo mesmo Custom Domain que já expõe R2 DATA hoje
   (`dados.imobiliarista.net`, docs/OPERATIONS.md pendência 3, §59).
   **Nenhuma rota de Worker nova** — sem push, sem token, sem
   autenticação; o robô de cada portal busca o arquivo sozinho.

2. **Opt-in por submódulo, não automático.** `broker.modules.feeds` é um
   objeto por submódulo (`{ vrsync: { enabled } }`), não mais um booleano
   único (revisão de uma versão anterior deste lote) — mesmo
   padrão/lugar de `modules/publications`, com uma chave a mais de nível
   para outros submódulos crescerem ao lado. `modules/feeds/config.js`
   tem `readFeedSubmoduleConfig`/`validateFeedSubmoduleConfig`/
   `hasAnyFeedSubmoduleEnabled`. `schemas/broker.schema.json#modules` já
   era `additionalProperties: true` — nenhuma mudança de schema.

3. **UI no painel: seção "Exportação" própria (`/exportacao`), não
   dentro do form de perfil.** Diferente de `publications` (que vive como
   uma segunda seção dentro do form de perfil) — "Modo Exportação" é
   pensado para crescer com N submódulos ao longo do tempo, o que pede
   uma lista própria em vez de um formulário que cresceria
   indefinidamente. A lista é gerada a partir do registry
   (`frontend/shared/feeds.generated.js`, `scripts/generate-feeds-assets.js`,
   `npm run generate:feeds`) — nunca hardcoded no componente.

4. **Formato XML: VrSync**, confirmado pelo solicitante — estrutura raiz
   (`ListingDataFeed`/`Header`/`Listings`/`Listing`) e a lista exata de
   campos a mapear (`ListingID`, `Title`, `Description`,
   `TransactionType`, `ListPrice`/`RentalPrice`, `PropertyType`,
   `PostalCode`, `LivingArea`/`LotArea`, `Media`) vieram diretamente do
   solicitante nesta rodada, colados no chat — não reconstruídos via
   busca. A doc oficial completa
   (`developers.grupozap.com/feeds/vrsync/elements/`) continuou
   inacessível para esta sessão o tempo todo (`EGRESS_BLOCKED` — política
   do proxy do ambiente, confirmada, não falha transitória; tentativas
   via web.archive.org e um proxy leitor de terceiros também bloqueadas).
   Dois campos que o solicitante pediu para confirmar "na doc" tiveram
   que ser resolvidos via `WebSearch` (snippets citando exemplos reais,
   não a página em si), por falta de acesso:
   - **O item de vídeo em `<Media>`** — `<Item medium="video">URL do
     YouTube</Item>`, confirmado por dois resultados de busca
     independentes, um deles citando um exemplo literal
     (`<Item medium="video">https://www.youtube.com/watch?v=MukVADdjQD8</Item>`).
     Razoavelmente confiante, mas não verificado na página real.
   - **Os valores de `PropertyType`** — só o subconjunto que
     `PROPERTY_TYPE_BY_LISTING_TYPE` (`formatters/vrsync.js`) mapeia foi
     confirmado (`Residential/Apartment`, `Residential/Home`,
     `Residential/Condominium`, `Residential/Penthouse`,
     `Residential/Studio`, `Residential/Land`, `Commercial/Office`,
     `Commercial/Store`, `Commercial/Warehouse`) — a lista completa do
     enum nunca apareceu inteira em nenhum snippet de busca, apesar de
     várias tentativas. Ver decisão 5.

5. **`listing.type` (texto livre, sem taxonomia fechada —
   `business/taxonomy.js` ainda é placeholder) sem mapeamento conhecido
   exclui o anúncio do feed**, em vez de inventar um `PropertyType`.
   Mesma postura para **`location.zipcode` ausente** — `PostalCode` é
   obrigatório na spec (confirmado pelo solicitante); um anúncio sem CEP
   fica de fora, documentado como pendência de dado incompleto, nunca
   uma tag vazia/inventada. `buildVrsyncListingXml` retorna `null` nos
   dois casos; `generateVrsyncFeed` filtra silenciosamente — um anúncio
   ruim de um corretor nunca derruba o feed inteiro dos outros.

6. **`ListingID` é o `listingId` PRIVADO (`business/listings.js`, ex.
   `listing_<uuid>`), não `listing.slug`.** Instrução explícita do
   solicitante ("ListingID = listingId interno"). `listing-public.schema.json`
   nunca carrega esse id (só `slug`) — `generator.js#collectFeedItems` já
   tem o `listingId` em mãos no laço sobre
   `storage/indexes.js#getBrokerListingIds` e o anexa a cada item.
   Comprimento: 1–50 caracteres na spec, `listing_` + UUID = 44 — cabe
   sem truncar (isso *não* seria verdade para o formato JSON estático da
   OLX, que uma rodada anterior deste lote também considerou — aquele
   `id` tinha regex `[A-Za-z0-9_{}-]{1,19}`; o formato final é XML/VrSync,
   então essa restrição não se aplica).

7. **Campo `zipcode` novo no schema do anúncio** (`core/validation.js#isZipcode`,
   `listing-draft.schema.json`, `listing-public.schema.json#location`,
   `business/listings.js`, `business/publishing.js#normalizeListingForPublic`,
   formulário do painel) — pré-requisito descoberto ao implementar o
   PostalCode obrigatório da spec; o schema do anúncio nunca teve CEP em
   lugar nenhum antes deste lote. **Opcional**, deliberadamente — não
   força todo corretor a preencher CEP para continuar usando o portal
   normalmente; só reflete em quem consegue aparecer no feed VrSync
   (decisão 5).

8. **Regeneração: recompute completo por submódulo, não incremental.**
   Mesmo espírito de `business/publishing.js#rebuildCity` (§33) — sempre
   recalcula do zero a partir do estado privado — mas sem particionamento
   em shards: o universo "corretores opt-in num submódulo" é normalmente
   um subconjunto pequeno de todos os corretores.

9. **Quando a regeneração dispara.** `worker/api.js`
   (`handlePutProfile`, `handleCreateListing`, `handlePutListing`,
   `handleDeleteListing`) e `worker/admin.js` (`handleApproveBroker`,
   `handleSuspendBroker`, `handleReactivateBroker`, `handlePublishBroker`)
   chamam `regenerateFeeds` nos mesmos pontos onde `business/publishing.js`
   já é chamado, gated por "o corretor afetado tem QUALQUER submódulo
   habilitado" (`hasAnyFeedSubmoduleEnabled`) — evita recompute completo
   numa escrita que não tem nada a ver com exportação.
   `handlePutProfile` é a exceção: regenera sempre que o patch toca
   `modules` (substituído por inteiro, sem merge profundo), mesmo que o
   resultado seja "tudo desligado" — senão desligar um submódulo nunca
   removeria o corretor do arquivo já publicado. `handleRebuildAll`
   regenera sem gate (toca todos os corretores) mas só quando o batch
   inteiro termina (`result.done`). `scripts/rebuild-feeds.js`
   (`npm run rebuild:feeds`) é o caminho manual/externo — não há Cron
   Trigger da Cloudflare implementado neste lote.

## Escopo deste lote

- `core/validation.js`, `schemas/listing-{draft,public}.schema.json`,
  `business/listings.js`, `business/publishing.js`,
  `frontend/painel/{forms,render}.js` — campo `zipcode` (decisão 7).
- `storage/keys.js#dataKeys.feed`, `storage/public.js#putPublicText`/`getPublicText`,
  `storage/cache.js` (`CACHE_TTL_SECONDS.feed`, 1h — o robô de um portal
  como a OLX só relê o arquivo a cada ~12h segundo a doc de integração
  encontrada via busca em uma rodada anterior deste lote).
- `modules/feeds/config.js`, `registry.js`, `formatters/vrsync.js`,
  `generator.js`, `index.js` (novos/reescritos).
- `worker/api.js`, `worker/admin.js`: chamadas gated a `regenerateFeeds`.
- `frontend/painel/`: `router.js` (`/exportacao`), `render.js`
  (`renderExportForm`, nav), `app.js` (`renderExportRoute`,
  `submitExport`), `styles/main.css`.
- `scripts/generate-feeds-assets.js` (novo, `npm run generate:feeds`) +
  `scripts/rebuild-feeds.js` (renomeado de `generate-feeds.js`,
  `npm run rebuild:feeds`).
- Testes: `tests/modules/feeds/registry.test.js` (novo),
  `vrsync-formatter.test.js` (renomeado/reescrito), `config.test.js`,
  `generator.test.js` — cobrindo registry, geração do XML com fixtures,
  filtro por corretor com submódulo desativado, corretor suspenso,
  anúncio sem CEP, mapeamento de tipo de transação.

## Verificação

Além da suíte automatizada, este lote foi verificado ponta a ponta com
`wrangler dev` real (`.dev.vars` local com `SESSION_SECRET`, corretor de
teste semeado via script): login → `PUT /api/me/profile` com
`modules.feeds.vrsync.enabled` → `feeds/vrsync.xml` gravado em R2 DATA
com o XML correto (namespace, `ListingID` = `listingId`, campos
mapeados). A seção "Exportação" do painel também foi aberta num browser
real via Playwright — navegação, checkbox refletindo o estado já salvo,
submissão, mensagem de sucesso — sem erro de console além do 401
esperado da checagem inicial de sessão (`frontend/painel/app.js`'s
própria "am I logged in?" probe).

## Pendências

- **`formatters/vrsync.js` precisa de revisão contra a documentação
  oficial completa** assim que houver rede liberada para
  `developers.grupozap.com/feeds/vrsync/elements/` — especialmente a
  lista completa de `PropertyType` e a confirmação do item de vídeo
  (decisão 4).
- **Ordem dos elementos dentro de `<Details>` não verificada contra o
  XSD real.** VrSync é declarado como schema com `xsi:schemaLocation`
  (provavelmente uma sequência ordenada) — a ordem usada aqui
  (`Description`, `ListPrice`/`RentalPrice`, `PropertyType`,
  `PostalCode`, `LivingArea`/`LotArea`) segue a ordem que o solicitante
  deu para os 4 campos que ele especificou, com `Description` inserida
  no início (não estava na lista dele) — posição não confirmada.
- **Só o submódulo `vrsync` existe** — outro formato/provedor é só uma
  entrada nova em `registry.js`, mas nenhum foi implementado (pendência
  explícita, conforme escopo pedido).
- **Sem endereço/rua/número no schema do anúncio** — só CEP foi
  adicionado (decisão 7); a spec do VrSync não pediu endereço completo
  nos campos que o solicitante confirmou, então não foi adicionado.
- **Sem Cron Trigger da Cloudflare** (`worker/cron.js` continua
  placeholder, §37 é escopo de outra etapa). Até existir, um corretor
  opt-in que edita um anúncio/perfil já dispara `regenerateFeeds`
  (decisão 9); `npm run rebuild:feeds` é o caminho manual até lá.
- **`Header.Email`/`Header.Telephone` usam placeholders**
  (`contato@imobiliarista.net`, sem telefone) quando
  `env.FEED_CONTACT_EMAIL`/`env.FEED_CONTACT_PHONE` não estão
  configurados (`modules/feeds/generator.js#buildFeedHeader`) — precisam
  de valores reais via `[vars]` no `wrangler.toml` antes de produção.
- **Sem paginação/particionamento do arquivo de feed** — ao contrário de
  uma cidade (§7-9), o feed inteiro sempre vai num único
  `feeds/{submódulo}.xml`. Para o volume esperado de corretores opt-in
  isso é §94 ("não adicionar peça nova antes de precisar"); revisar
  contra o mesmo limite híbrido (~1MB/300, §9) se crescer muito.
