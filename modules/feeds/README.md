# Módulo: feeds

Ver §46 (e §38-§40, §67, §90, §94, §101) de
`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`. §46 é só a árvore
de arquivos do módulo (`index.js`, `registry.js`, `formatters/`,
`generator.js`, `README.md`) + uma frase — "Exports ficam no R2" — sem
definir onde o robô do portal externo busca o arquivo, se é opt-in por
corretor, nem o formato exato do XML. Este README documenta o que
preencheu essa ambiguidade, confirmado com o solicitante antes deste lote.

## Diferença em relação aos módulos anteriores da Etapa 9

`appointments`, `comparison`, `financing-calculator`, `publications`,
`pwa`, `tour-360`, `video-youtube` são todos client-side puros (ou não têm
nada para persistir) — o browser do visitante já está lá, executando
JavaScript, então "módulo" sempre significou "função pura + no máximo um
bundle gerado para `frontend/`". `feeds` é o primeiro módulo desta etapa
consumido por um **robô de portal externo** (OLX/ZAP), que faz uma
requisição HTTP direta a uma URL esperando XML — não executa JavaScript,
não pode depender do Browser montar nada. Por isso `modules/feeds/generator.js`
é o primeiro módulo desta etapa que toca R2/business diretamente no
servidor (§39 permite essa direção, MODULES -> BUSINESS -> CORE -> STORAGE)
em vez de só embutir funções puras num bundle client-side.

## Decisões tomadas (nenhuma delas está escrita em §46)

1. **Onde o feed fica disponível: arquivo estático em R2 DATA, não uma
   rota de Worker.** Decisão de produto confirmada explicitamente antes
   deste lote — reforçada pelo próprio solicitante citando §94/§101
   ("edge-first... Worker é exceção, não regra") e o custo de cota de um
   robô batendo repetidamente numa rota que computasse o XML na hora.
   `modules/feeds/generator.js#regenerateFeeds` escreve
   `feeds/{portal}.xml` em R2 DATA (`storage/keys.js#dataKeys.feed`,
   `storage/public.js#putPublicText` — nova função, primeiro objeto não-JSON
   que R2 DATA guarda; `storage/public.js#putPublic`/`getPublic` sempre
   fizeram `JSON.stringify`/`.json()`) e o robô do OLX busca o arquivo
   direto pelo mesmo Custom Domain que já expõe R2 DATA publicamente hoje
   (`dados.imobiliarista.net`, docs/OPERATIONS.md pendência 3, §59) —
   **nenhuma rota de Worker nova**. `https://dados.imobiliarista.net/feeds/olx.xml`
   é a URL a cadastrar no Canal Pro da OLX assim que o Custom Domain
   existir de verdade (pendência bloqueante herdada da Etapa 1, não nova
   deste lote).

2. **Opt-in por corretor, não automático.** `broker.modules.feeds.enabled`
   — mesmo padrão/lugar que `modules/publications` já usa
   (`broker.modules.publications`), por simetria explícita pedida pelo
   solicitante. `schemas/broker.schema.json#modules` já é
   `additionalProperties: true` ("shape owned by each module, not by
   core") — nenhuma mudança de schema necessária, exatamente como
   `publications`. `modules/feeds/config.js` (não `index.js` — ver o
   header desse arquivo para o porquê de existir separado, um motivo
   diferente do de `modules/publications/config.js`) tem
   `readFeedsConfig`/`validateFeedsConfig`. **Sem UI no painel neste lote**
   — ver Pendências.

3. **Formato XML: VRSync**, o schema que OLX Imóveis e ZAP/VivaReal
   compartilham (as duas marcas pertencem ao Grupo OLX hoje;
   `http://www.vivareal.com/schemas/1.0/VRSync`). Fonte oficial:
   [developers.olx.com.br/anuncio/xml/real_estate](https://developers.olx.com.br/anuncio/xml/real_estate/home.html)
   e [developers.grupozap.com/feeds/vrsync](https://developers.grupozap.com/feeds/vrsync/).

   **Limitação importante desta sessão: o acesso de rede a ambos os
   domínios foi bloqueado pelo proxy do ambiente** (todo `WebFetch`
   retornou `EGRESS_BLOCKED`, inclusive tentativas via web.archive.org e
   um proxy leitor de terceiros). `modules/feeds/formatters/olx.js` foi
   reconstruído a partir de **snippets de resultado de busca** dessas
   mesmas páginas — nomes de elemento, atributos e um exemplo completo
   apareceram citados literalmente nos snippets — não da página em si.
   Consultas usadas (todas via WebSearch, não WebFetch):
   - `"ListingDataFeed" OR "<Listings>" xml imóveis OLX ZAP exemplo tags`
     — exemplo completo de `<Header>`/`<Listing>` top-level.
   - `grupozap vrsync "Location" element "Neighborhood" "PostalCode" "DisplayAddress" required`
   - `grupozap vrsync "ListPrice" "RentalPrice" currency period AdministrationFee`
   - `grupozap vrsync "<Media>" "<Item" medium caption primary href exemplo completo xml`

   **Antes de submeter este feed de verdade ao Canal Pro da OLX, alguém
   com rede liberada precisa reabrir as duas URLs oficiais acima e
   diferenciar contra `formatters/olx.js`** — ver Pendências para a lista
   exata do que não pôde ser confirmado.

4. **`type` (business/listings.js) é texto livre — `business/taxonomy.js`
   ainda é placeholder (§70)** — não existe uma lista fechada de tipos de
   imóvel no projeto hoje. `PROPERTY_TYPE_BY_LISTING_TYPE`
   (`formatters/olx.js`) só mapeia os valores que os testes/fixtures deste
   projeto já usam (`apartamento`, `casa`, `cobertura`, `kitnet`/`studio`,
   `terreno`/`lote`, `sala`/`sala-comercial`, `loja`, `galpao`) — **não** é
   uma transcrição do enum completo de `PropertyType` da OLX (bloqueado,
   ver decisão 3). Um anúncio cujo `type` não está nessa tabela é
   **excluído do feed** (`buildOlxListingXml` retorna `null`) em vez de
   mandar um `PropertyType` inventado que arriscaria a OLX rejeitar o
   arquivo inteiro — mesma postura "não invente tags/estrutura" pedida
   pelo solicitante, aplicada também aos *valores* dos campos, não só às
   tags.

5. **`Location` sem endereço/CEP.** `listing-public.schema.json` nunca
   pediu rua/número/CEP (§15/§30) — só `district`/`latitude`/`longitude`.
   `buildLocationTag` usa `displayAddress="Neighborhood"` e omite
   `PostalCode`/`Address`/`StreetNumber` inteiramente, em vez de inventar
   um valor. Uma fonte encontrada via busca chamou `PostalCode`
   "obrigatório em todos os anúncios enviados" — se isso for confirmado ao
   reabrir a doc oficial (decisão 3), o projeto precisaria de um campo CEP
   novo no draft/schema do anúncio antes deste feed funcionar de verdade
   com a OLX; ver Pendências.

6. **Regeneração: recompute completo, não incremental.** Mesmo espírito
   de `business/publishing.js#rebuildCity` (§33) — sempre recalcula do
   zero a partir do estado privado — mas sem o particionamento em shards
   que `rebuildCity` precisa: o universo aqui ("corretores opt-in") é
   normalmente um subconjunto pequeno de todos os corretores, então um
   recompute completo (`modules/feeds/generator.js#collectFeedItems`
   percorre `getKnownBrokerIds` -> filtra ativo+opt-in -> percorre os
   `listingIds` de cada um) já é barato o bastante para não justificar a
   complexidade de um upsert incremental por anúncio.

7. **Quando a regeneração dispara.** "a cada publicação/rebuild" (a
   orientação recebida) foi interpretado como "os mesmos pontos de
   gatilho que `business/publishing.js` já usa", com um gate para não
   pagar o custo de um recompute completo numa escrita que não tem nada a
   ver com feeds:
   - `worker/api.js` (`handlePutProfile`, `handleCreateListing`,
     `handlePutListing`, `handleDeleteListing`): chama
     `regenerateFeeds` só quando o corretor dono da escrita tem
     `modules.feeds.enabled` — uma leitura já em mãos (`getBrokerById`),
     não uma varredura. `handlePutProfile` é a exceção: regenera sempre
     que o patch toca `modules` (o campo é substituído por inteiro,
     `business/brokers.js#updateBrokerProfile` não faz merge profundo),
     mesmo que o resultado seja `enabled: false` — senão desligar o módulo
     nunca removeria o corretor do feed já publicado.
   - `worker/admin.js` (`handleApproveBroker`, `handleSuspendBroker`,
     `handleReactivateBroker`, `handlePublishBroker`): mesmo gate, usando
     o `broker` que cada handler já tem em mãos. `handleRebuildAll`
     regenera sem gate (toca todos os corretores indiscriminadamente) mas
     só quando o batch inteiro termina (`result.done`), não a cada
     chamada intermediária de um rebuild checkpointável (§34).
   - `scripts/generate-feeds.js` (`npm run generate:feeds`): caminho
     manual/externo, mesmo padrão de `scripts/rebuild-*.js`. Existe porque
     **nenhum Cron Trigger da Cloudflare foi implementado neste lote**
     (`worker/cron.js` continua placeholder, §37 é escopo de outra etapa)
     — sem ele, nada regenera o feed periodicamente por conta própria; ver
     Pendências.

## Escopo deste lote

- `storage/keys.js#dataKeys.feed`, `storage/public.js#putPublicText`/`getPublicText`,
  `storage/cache.js` (`CACHE_TTL_SECONDS.feed`, 1h — o robô da OLX só relê
  o arquivo a cada ~12h segundo a doc de integração encontrada via busca,
  então isto é sobre limitar leituras de R2 entre regenerações nossas, não
  sobre atender o robô mais rápido).
- `modules/feeds/config.js`, `registry.js`, `formatters/olx.js`,
  `generator.js`, `index.js` (novos).
- `worker/api.js`, `worker/admin.js`: chamadas gated a `regenerateFeeds`
  nos pontos listados na decisão 7 acima.
- `scripts/generate-feeds.js` (novo, `npm run generate:feeds`).
- Testes: `tests/modules/feeds/olx-formatter.test.js` (puro, fixtures),
  `tests/modules/feeds/config.test.js`, `tests/modules/feeds/generator.test.js`
  (end-to-end sobre `FakeR2Bucket`, cobrindo o filtro de quem entra/sai:
  opt-in, corretor ativo, corretor suspenso — Etapa 8a — anúncio
  active/paused/sold/draft).

## Pendências

- **`formatters/olx.js` foi escrito sem acesso à documentação oficial
  (rede bloqueada, decisão 3) — precisa de revisão contra a página real
  antes de qualquer submissão real ao Canal Pro da OLX.** Especificamente
  não confirmado: a lista completa do enum `PropertyType` (só um
  subconjunto pequeno está mapeado, decisão 4); se `PostalCode` é de fato
  obrigatório (decisão 5); a estrutura exata de um item de vídeo em
  `<Media>` (incluído com `medium="video"` só porque dois snippets de
  busca independentes mencionaram esse padrão, sem ver a página).
- **`formatters/zap.js` não existe neste lote** — VRSync é compartilhado
  entre OLX e ZAP (decisão 3), então a maior parte do trabalho de
  formatação já está feita, mas registrar `zap` em `registry.js` e
  confirmar se há qualquer diferença de portal (ex.: um `Provider`
  diferente) ficou de fora por escopo, conforme sinalizado como aceitável
  no comando deste lote.
- **Sem UI no painel para o corretor ligar/desligar o módulo.** O
  backend/config já aceita e persiste `modules.feeds.enabled` (mesmo
  caminho genérico que `publications` usa, `PUT /api/me/profile` com
  `{modules: {...perfil.modules, feeds: {enabled}}}`), mas nenhum
  formulário novo foi adicionado a `frontend/painel/`. Fora do escopo
  explícito pedido para este lote.
- **Sem endereço/CEP no schema do anúncio** (decisão 5) — se a OLX
  exigir `PostalCode` de verdade, isso precisa de um campo novo em
  `schemas/listing-draft.schema.json`/`listing-public.schema.json` +
  `business/listings.js` + formulário do painel, fora do escopo deste
  lote (mudaria o schema de anúncio usado por todo o projeto, não só por
  este módulo).
- **Sem Cron Trigger da Cloudflare** — `worker/cron.js` continua
  placeholder (§37, outra etapa). Até existir, um corretor opt-in que edita
  um anúncio/perfil já dispara `regenerateFeeds` (decisão 7), mas nada
  regenera por conta própria se, por exemplo, `business/cities.js`'s
  catálogo de cidades mudar sem nenhuma escrita de corretor acontecer
  depois. `npm run generate:feeds` é o caminho manual até lá.
- **`Header.Email`/`Header.Telephone` usam placeholders**
  (`contato@imobiliarista.net`, sem telefone) quando `env.FEED_CONTACT_EMAIL`/
  `env.FEED_CONTACT_PHONE` não estão configurados
  (`modules/feeds/generator.js#buildFeedHeader`) — precisam de valores
  reais via `[vars]` no `wrangler.toml` (não são segredos) antes de
  produção.
- **Sem paginação/particionamento do arquivo de feed** — ao contrário de
  uma cidade (§7-9), o feed inteiro sempre vai num único
  `feeds/{portal}.xml`. Para o volume esperado de corretores opt-in isso é
  §94 "não adicionar peça nova antes de precisar"; se o número de
  anúncios opt-in crescer muito, revisar contra o mesmo limite híbrido
  (~1MB/300, §9) que as cidades já usam.
