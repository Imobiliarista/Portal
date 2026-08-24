# Módulo: publications

Ver §47 (e §38-§40, §54, §67, §90, §94) de
`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`. §47 é curto —
"Pode consumir feed externo no Browser, mesma filosofia do ACTS. Config
no perfil público do corretor: `{publications: {enabled, feedUrl}}`" —
e não especifica nem o formato do feed nem como `feedUrl` chega a existir.
Este README documenta o que preenche essa ambiguidade.

## Diferença em relação a tour-360/video-youtube (§49/§50)

Os dois módulos anteriores da Etapa 9 isolam um campo **opcional do
imóvel** (`listing.tour360`/`listing.video`), já validado em
`business/listings.js` desde a Etapa 3. `publications` é outra coisa: um
config **no perfil do corretor** (`broker.modules.publications`), que já
existe desde a Etapa 3 como o campo genérico e opaco `modules`
(`schemas/broker.schema.json#modules`, `additionalProperties: true` —
"shape owned by each module, not by core"). Nenhuma mudança de schema foi
necessária: `business/brokers.js` já aceita/persiste `modules` como
objeto livre, e `business/publishing.js#normalizeBrokerForPublic` já
copia esse objeto inteiro para a projeção pública
(`brokers/{slug}/profile.json`) — é por aí que `{enabled, feedUrl}` chega
ao minisite.

## Escopo deste lote

- `modules/publications/config.js` (novo): forma e validação de
  `{enabled, feedUrl}` — `readPublicationsConfig` (leitura com defaults
  seguros, nunca lança) e `validatePublicationsConfig` (UX nicety para o
  painel, mesmo espírito do comentário em `frontend/painel/forms.js` —
  "a fonte de verdade real é o que o corretor efetivamente configurou,
  não uma checagem de schema no backend", já que `modules` é opaco para
  o Worker).
- `modules/publications/index.js` (novo): descoberta do feed a partir do
  link do blog (`resolveBloggerFeedUrl` + helpers) e parsing do feed Atom
  (`parseAtomFeed` + helpers) — ver "Decisões" abaixo para o porquê de
  cada uma.
- `scripts/generate-publications-assets.js` (novo, `npm run
  generate:publications`, mesmo padrão de
  `scripts/generate-video-youtube-assets.js`): escreve
  `frontend/shared/publications.generated.js` a partir de `index.js` +
  `config.js` — Workers Static Assets só publica `frontend/`
  (`wrangler.toml`), então nenhum dos dois arquivos-fonte é alcançável
  pelo browser sem esse passo. Regenerar sempre que qualquer um dos dois
  mudar.
- `frontend/painel/`: `renderProfileForm` ganha uma segunda seção/form
  ("Publicações") com checkbox `enabled` + campo de link do blog;
  `frontend/painel/app.js#submitPublications` resolve o link (quando
  informado) via `resolveBloggerFeedUrl` antes de gravar.
- `frontend/minisite/`: `app.js#loadPublications` busca e faz o parsing
  do feed já resolvido; `render.js` ganha a seção condicional
  (`renderPublicationsSection`), só aparece quando há pelo menos uma
  entrada.

## Decisões tomadas (§47 é enxuto — nenhuma delas está escrita no documento)

1. **Fonte é Blogger/Blogspot especificamente, não RSS genérico de
   qualquer blog/CMS.** Decisão de produto confirmada explicitamente
   para este lote (não inferida) — o corretor cola o link do blog
   Blogger dele, não um link de feed arbitrário.
2. **O corretor cola o link do BLOG, não o link do feed.**
   `feedUrl` salvo em `modules.publications` já é o feed **resolvido**,
   nunca a URL crua que o corretor colou — o campo do formulário no
   painel é "Link do blog", não "URL do feed".
3. **A descoberta roda uma única vez, no painel — nunca a cada
   carregamento do minisite.** `resolveBloggerFeedUrl(blogUrl)`: tenta o
   padrão documentado do Blogger (`{origin}/feeds/posts/default`) e, se a
   resposta não parecer um feed Atom (`looksLikeAtomFeed`), cai para
   autodiscovery — busca a página do blog e procura
   `<link rel="alternate" type="application/atom+xml" href="...">` — com
   uma verificação final antes de aceitar. O resultado (uma URL) é o que
   fica salvo; se nada funcionar, retorna `null` e o painel recusa
   habilitar o módulo sem um feed resolvido
   (`validatePublicationsConfig`). Deixar o campo de blog em branco numa
   edição futura preserva o `feedUrl` já resolvido — não força uma nova
   descoberta a cada salvamento do perfil.
4. **Parsing do Atom é regex, não `DOMParser`.** O projeto não tem
   jsdom nem qualquer dependência de parsing de XML/HTML
   (`package.json` só lista `wrangler`), e o padrão já estabelecido
   pelos módulos anteriores é função pura testável em Node puro — ver
   `modules/pwa/index.js#registerServiceWorker`, que injeta
   `navigator`/`document` em vez de precisar de um fake de DOM.
   Reproduzir esse mesmo padrão para `DOMParser` exigiria uma
   implementação fake de DOM só para os testes, o que é mais superfície
   do que um parser regex tolerante (nunca lança; entrada não
   reconhecida vira `null`/`[]`) para o subconjunto de tags do Atom que
   este módulo precisa (`entry`, `title`, `link`, `published`/`updated`,
   `summary`/`content`).
5. **`modules/publications/config.js` não importa `core/validation.js`.**
   Diferente de `business/brokers.js` (que roda só no Worker/Node),
   `config.js` também precisa rodar embutido no bundle gerado que o
   browser carrega (`readPublicationsConfig`/`validatePublicationsConfig`
   são usadas tanto pelo painel quanto pelo minisite). Importar
   `core/validation.js` arrastaria a classe `ValidationError` inteira
   pro bundle gerado só para validar dois campos — `isHttpUrl` local
   (mesmo crivo de `core/validation.js#isUrl`) resolve sem essa
   dependência.
6. **Conteúdo do feed nunca vira `innerHTML`.** `title`/`summary` do
   feed são conteúdo de terceiro que o projeto não controla — o parser já
   despe qualquer marcação (`stripTags`) antes de normalizar, e
   `frontend/minisite/render.js#el()` só usa `node.textContent`, nunca
   `innerHTML`, mesma convenção já seguida em todo `render.js` do
   projeto. Nenhum vetor de XSS via feed externo.
7. **Seção do minisite só aparece com pelo menos uma entrada —
   `enabled: true` com feed vazio/inacessível não mostra uma seção
   vazia.** Mesmo espírito de §49 ("se inexistente, componente não
   renderiza"); `loadPublications` nunca lança, uma falha de rede vira
   `[]` silenciosamente.
8. **Busca do feed roda em paralelo com os imóveis, não antes.**
   `frontend/minisite/app.js#renderProfileRoute` dispara
   `loadPublications` e a busca de imóveis ao mesmo tempo — um blog
   externo lento ou fora do ar não deveria atrasar o conteúdo principal
   do minisite (os imóveis).
9. **`PATCH modules` do painel manda o objeto `modules` inteiro, não só
   `publications`.** `business/brokers.js#updateBrokerProfile` substitui
   `modules` por completo (`{...current, ...picked}`, sem merge
   profundo) — `frontend/painel/app.js#submitPublications` precisa
   espalhar `profile.modules` existente antes de sobrescrever a chave
   `publications`, senão qualquer outro módulo já configurado no mesmo
   objeto seria apagado.

## Pendências

- **CORS do lado do Blogger não foi verificado neste lote.** Tanto a
  descoberta (`resolveBloggerFeedUrl`, no painel) quanto o consumo
  (`parseAtomFeed`'s fetch, no minisite) fazem `fetch()` cross-origin
  direto do Browser para `*.blogspot.com` — isso só funciona se o
  Blogger responder com cabeçalhos CORS permissivos
  (`Access-Control-Allow-Origin`) nessas rotas. Não há Worker/CSP do
  projeto bloqueando isso (a
  Content-Security-Policy de `core/security.js` só se aplica a respostas
  de `/api/*`, nunca aos Static Assets do minisite/painel — ver
  `wrangler.toml#run_worker_first`), mas o servidor do Blogger é fora do
  controle do projeto. Se isso se provar um bloqueio real em produção, a
  saída seria um proxy no Worker só para esse fetch — o que voltaria a
  contrariar "preferir client-side" (§44/§47) e precisaria de decisão
  explícita.
- **Só Blogger/Blogspot é suportado** — outro provedor de blog (Medium,
  WordPress.com, etc.) exigiria uma estratégia de descoberta diferente,
  fora de escopo aqui (decisão de produto confirmada só para Blogger
  neste lote).
- **Sem paginação/atualização incremental do feed** — `parseAtomFeed`
  sempre lê os até 10 posts mais recentes do feed inteiro a cada
  carregamento do minisite; não há cache/ETag/If-Modified-Since. Para um
  blog com poucos posts isso é irrelevante; se um corretor tiver um blog
  muito ativo, cada visita ao minisite refaz o fetch completo do feed.
- **Sem verificação de que o link colado no painel é de fato um domínio
  Blogger/Blogspot** — `resolveBloggerFeedUrl` aceita qualquer URL http(s)
  e só falha organicamente (nenhum feed Atom encontrado) se não for. Um
  corretor colando o link de outro tipo de site só recebe "não foi
  possível encontrar o feed", sem uma mensagem mais específica.
