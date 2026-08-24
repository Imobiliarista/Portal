# Módulo: pwa

Ver §48 (e §38-§40, §59-§61, §90, §94) de
`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`. §48 é só duas
frases — "Módulo isolado. Não tornar PWA dependência do portal." — então
este README documenta as decisões que preenchem essa ambiguidade.

## Escopo deste lote

PWA do **portal público** (`imobiliarista.net` / `www.` / `localhost` sem
`?app=`), não do minisite, painel ou admin — o manifest é branding
estático do portal ("imobiliarista.net"/"Imobiliarista"), não algo por
corretor, então aplicá-lo a minisites (`slug.imobiliarista.net`, origem
diferente por corretor) ficaria semanticamente errado. Ver "Decisões" abaixo.

- `manifest.js` — config estática (nome, ícones, cores, `start_url`,
  `display`) + `buildManifestObject()`, puro.
- `service-worker.js` — fonte do service worker: precache do app shell do
  portal (`frontend/portal/*`) e cache dos JSONs públicos que
  `frontend/portal/data.js` busca (`portal/cities.json`,
  `cities/{slug}/manifest|index|NNN.json`, `listings/{slug}.json`), com
  TTL puxado de `storage/cache.js#CACHE_TTL_SECONDS` (§59-§61) — nunca
  redigitado.
- `index.js` — `registerServiceWorker()`, o único ponto de contato com o
  frontend.

## Como os Static Assets reais chegam ao browser

Workers Static Assets só serve o que está dentro de `frontend/`
(`wrangler.toml` `[assets] directory = "frontend"`) — então
`modules/pwa/service-worker.js` e `modules/pwa/manifest.js`, morando fora
dessa pasta, nunca são alcançáveis pelo browser, e não há bundler no
projeto (todo `frontend/*.js` é ESM puro, sem build step). A saída real
que o browser busca —`frontend/manifest.json` e `frontend/service-worker.js`
— é **gerada**: `scripts/generate-pwa-assets.js` (mesmo padrão de
`scripts/generate-cities-catalog.js`) importa `buildManifestObject()` e
`renderServiceWorkerSource()` e grava os dois arquivos. Regenerar com:

```
npm run generate:pwa
```

Os dois arquivos gerados são commitados (nunca editados à mão) — mesmo
espírito de `business/data/cities-catalog.generated.js`.

`renderServiceWorkerSource()` embute (nunca redigita) a mesma
`CACHE_TTL_SECONDS` de `storage/cache.js` e a mesma função
`classifyJsonRequestKind` testada em Node (via `.toString()`) — o código
que passa nos testes é literalmente o código que vai para o browser.

## Registro no portal (§48 "não tornar PWA dependência do portal")

O único ponto de contato é em `frontend/index.html` (o shell compartilhado
que já decide portal/minisite/painel/admin por hostname): se o host for o
portal, injeta `<link rel="manifest">` e chama
`navigator.serviceWorker.register(...)`, com `.catch(() => {})`. Se
`modules/pwa/` inteiro for removido (e os gerados `frontend/manifest.json`
/ `frontend/service-worker.js` junto), esse trecho falha em silêncio — o
`<link>` quebrado é ignorado pelo browser, `register()` rejeita e é
capturado — e o portal continua funcionando 100% normal. Nenhuma outra
lógica do módulo entra em `frontend/portal/app.js` ou equivalentes.

## Estratégia de cache do service worker (§59-§61)

- **App shell** (`frontend/portal/*`) — cache-first no `install`
  (`SHELL_CACHE_NAME`), com fallback de rede. Só o portal está no shell
  precacheado neste lote (ver "Decisões").
- **JSONs públicos** — network-first (a versão publicada é sempre a fonte
  de verdade, §61 `publicationVersion`); se a rede falhar, cai para o
  cache **só se a entrada ainda estiver dentro do TTL do seu tipo**
  (mesmas constantes de `CACHE_TTL_SECONDS`) — nunca serve, mesmo offline,
  algo que o próprio edge já consideraria velho.
- `media` (TTL longo, §59) fica de fora de propósito: não é JSON e não é
  buscado por `frontend/portal/data.js`.

## Decisões tomadas (§48 é enxuto — nenhuma delas está escrita no documento)

1. **Escopo = portal, não minisite/painel/admin.** O documento não diz se
   "o portal" em "não tornar PWA dependência do portal" também cobre
   minisite/painel/admin. Como a config é estática e não depende de
   corretor/imóvel, e minisites são origens diferentes por corretor
   (`slug.imobiliarista.net`), tratar o portal como o único alvo deste
   lote foi a leitura mais conservadora. Habilitar PWA para minisite
   exigiria manifest por corretor (nome/ícone do corretor) — fora de
   escopo aqui, ficaria para um lote futuro decidir se `pwa` ganha uma
   segunda config parametrizada por `brokerSlug` ou se isso vira parte de
   outro módulo.
2. **`manifest.json`/`service-worker.js` como Static Assets gerados, não
   escritos à mão em `frontend/`.** O documento manda preferir Static
   Asset puro (§94) e evitar rota de Worker — mas não resolve onde o
   "código fonte" do módulo mora vs. onde o browser precisa buscá-lo.
   Escrever os dois arquivos à mão diretamente em `frontend/` deixaria
   `modules/pwa/` sem a árvore de arquivos que §67 define
   (`manifest.js`/`service-worker.js` dentro do módulo) e arriscaria
   `frontend/service-worker.js` divergir de `storage/cache.js` com o
   tempo (exatamente o que a instrução deste lote pede pra evitar). Um
   gerador — já um padrão estabelecido neste repo
   (`scripts/generate-cities-catalog.js`) — resolve as duas coisas.
3. **Nenhuma rota de Worker.** `worker/index.js` continua sem
   `/manifest.json` nem `/service-worker.js` — são Static Assets normais,
   cacheados/servidos de graça pela Cloudflare (§94, §96), consistente com
   "Não usar Worker... quando o shell SPA puder atender diretamente" (§73).
4. **Ícone**: só existe `frontend/icons/icon.svg` (um ícone mínimo,
   monocromático, escrito à mão) — não há ícones PNG reais no projeto
   ainda. SVG é aceito por manifests modernos (`sizes: "any"`), mas para
   melhor compatibilidade de instalação (principalmente Android
   `maskable`) ícones PNG de verdade (192×192, 512×512, variante
   maskable) deveriam substituir/complementar este antes de um lançamento
   real — ver pendências.
5. **TTL do cache do service worker usa as mesmas categorias de
   `storage/cache.js`**, mas só as que `frontend/portal/data.js`
   realmente busca hoje (`portalCatalog`, `cityManifest`, `cityIndex`,
   `cityShard`, `listingPublic`) + `brokerProfile` (não buscado pelo
   portal hoje, mas é uma categoria pública existente e o classificador
   reconhece o padrão de URL de qualquer forma — não custa nada incluir).
   `media` fica de fora: não é JSON.

## Pendências

- Ícones PNG reais (192×192, 512×512, variante `maskable`) — hoje só
  `icon.svg`.
- Decidir (produto, não arquitetura) se/quando minisite ganha seu próprio
  manifest por corretor.
- `frontend/portal/components/` está vazio (`.gitkeep`) — se algum
  componente futuro adicionar novos arquivos ao app shell do portal,
  `PWA_SHELL_ASSETS` (`modules/pwa/service-worker.js`) precisa listá-los e
  `npm run generate:pwa` precisa rodar de novo.
