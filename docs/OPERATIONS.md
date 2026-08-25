# Operações

## Pendências não-bloqueantes (Etapa 9, módulo feeds)

9. **Feed OLX sem revisão contra a documentação oficial.** O acesso de
   rede da sessão que implementou `modules/feeds/formatters/olx.js` foi
   bloqueado para `developers.olx.com.br`/`developers.grupozap.com` — o
   formatter foi reconstruído a partir de snippets de busca, não da página
   oficial. Antes de cadastrar `https://dados.imobiliarista.net/feeds/olx.xml`
   no Canal Pro da OLX de verdade, reabrir as duas URLs (ver
   `modules/feeds/README.md#decisões`, item 3) de um ambiente com rede
   liberada e diferenciar contra o formatter.
10. **`FEED_CONTACT_EMAIL`/`FEED_CONTACT_PHONE`**: vars opcionais (não
    segredo) lidas por `modules/feeds/generator.js#buildFeedHeader` para o
    `<Header>` do XML — sem elas, o feed sai com um e-mail placeholder e
    sem telefone. Configurar em `[vars]` no `wrangler.toml` antes de
    produção.
11. **Custom Domain de R2 DATA** (mesma pendência bloqueante 3 abaixo) é
    também o que torna o feed alcançável pelo robô da OLX/ZAP — sem ele,
    `feeds/olx.xml` existe no bucket mas não tem URL pública nenhuma.

## Pendências não-bloqueantes (Etapa 8a)

5. **Provisionamento do primeiro SuperAdmin**: não existe rota HTTP de
   criação de corretor/admin neste lote (§53 lista "criar corretor", mas
   ficou fora do escopo pedido — ver docs/CHANGELOG.md). Para criar a
   primeira conta superadmin, hoje só via script/console, chamando
   diretamente:

   ```js
   import { createBroker } from "./business/brokers.js";
   import { setAuthPassword } from "./business/auth.js";

   const broker = await createBroker(env, {
     userId: "user_admin_1",
     slug: "admin", // não vira minisite público de verdade — broker-public.schema.json não distingue "é admin"
     name: "Nome do admin",
     plan: "internal",
     status: "active",
     email: "admin@imobiliarista.net",
   });
   await setAuthPassword(env, broker.userId, "senha-forte-aqui", { role: "superadmin" });
   ```

   O mesmo vale para colocar o primeiro corretor real em `pending` para
   testar o fluxo de aprovação — sem rota de autocadastro pública ainda,
   `createBroker` direto é o único caminho.

   **Nota Etapa 8b**: o `plan: "internal"` acima continua sendo só o texto
   livre que `business/brokers.js#createBroker` sempre aceitou (Etapa 3) —
   não precisa (e normalmente não deve) corresponder a um `planId` real do
   catálogo de `business/plans.js`, já que uma conta superadmin não
   publica anúncios como corretor. Se algum dia isso mudar, atribua um
   plano de verdade via `PUT /api/admin/brokers/:id/plan` depois de criar
   o plano correspondente.

## Pendências não-bloqueantes (Etapa 8b)

6. **Catálogo real de planos**: este lote só constrói a estrutura de CRUD
   (`business/plans.js`, `/api/admin/plans*`) e semeia um único plano
   `"free"` (50 fotos/anúncio — mesmo valor do antigo
   `PROVISIONAL_MAX_GALLERY_ITEMS`) como fallback técnico para corretor sem
   plano atribuído. Nomes, preços e limites dos planos reais (ex.: um
   "premium") são decisão de produto ainda não tomada — use
   `POST /api/admin/plans` para criá-los quando a decisão existir.
7. **Limite de anúncios ativos por corretor**: fora do escopo deste lote
   por decisão explícita do solicitante — o documento não define esse
   limite em lugar nenhum. Só o limite de fotos por anúncio foi migrado
   para o sistema de planos.
8. **`business/brokers.js#createBroker`'s `plan` field**: continua sendo
   validado só como texto livre (`isNonEmptyString`, não contra o catálogo
   de `business/plans.js`) — não foi tocado neste lote porque não existe
   rota de criação de corretor (`POST /api/admin/brokers`, ver pendência
   da Etapa 8a) que precisasse dessa validação. `assignBrokerPlan` (Etapa
   8b) é o único caminho hoje que garante um `broker.plan` apontando para
   um plano que de fato existe.

## Pendências bloqueantes (Etapa 6)

4. **Catálogo nacional de municípios (IBGE)**: `business/data/cities-catalog.generated.js`
   é o que resolve `city.name`/`city.uf` (exigidos por
   `city-manifest.schema.json`) a partir do slug de cidade que
   `business/listings.js` guarda no draft do anúncio. O arquivo commitado
   hoje é só uma amostra pequena (4 cidades reais + um par sintético) — a
   sessão que implementou a Etapa 6 não tinha rede liberada para
   `servicodados.ibge.gov.br` (bloqueio de política do ambiente). Antes do
   deploy:

   ```bash
   npm run generate:cities   # roda scripts/generate-cities-catalog.js
   ```

   de um ambiente com rede liberada para o IBGE, e commitar o resultado
   (cobertura nacional, ~5.570 municípios). Sem isso, publicar um anúncio
   em qualquer cidade fora da amostra falha explicitamente com
   `UnknownCityError` — nunca silenciosamente.

## Pendências bloqueantes (Etapa 1)

Estas ações são manuais, no painel Cloudflare, e **bloqueiam** um
`wrangler versions upload`/`wrangler deploy` de ponta a ponta com os
bindings reais (o `wrangler deploy --dry-run` local já valida a sintaxe do
`wrangler.toml` sem elas, mas o binding não resolve contra um bucket real
até ele existir).

1. **Criar os 3 buckets R2** (Workers & Pages → R2):
   - `imob-private`
   - `imob-data`
   - `imob-media`

   Os nomes devem ser exatamente esses — `wrangler.toml` já referencia
   `bucket_name = "imob-private" | "imob-data" | "imob-media"` com os
   bindings `IMOB_PRIVATE` / `IMOB_DATA` / `IMOB_MEDIA`.

2. **Configurar o build do projeto** (Workers & Pages → *nome do worker* →
   Configurações → Build), assim que o projeto Cloudflare deste repositório
   existir:
   - **Comando da versão** (branches `claude/*`, não promove tráfego):
     `npx wrangler versions upload`
   - **Comando de implantação** (somente `main`): `npx wrangler deploy`

   Os dois campos **nunca** devem ter o mesmo valor — isso geraria deploy de
   produção completo a cada push de branch de trabalho.

3. **Custom Domain + Cache Rule para R2 DATA/MEDIA** (§59): o cache de JSON
   público depende de uma Cache Rule explícita no Custom Domain do bucket —
   não existe por padrão. TTLs alvo por tipo de objeto estão centralizados
   em `storage/cache.js` (`CACHE_TTL_SECONDS`); a Cache Rule no painel deve
   refletir esses mesmos valores.

## Segredos

Nenhum segredo vai para `wrangler.toml` nem para o Git (§3.1, §27). Desde a
Etapa 4 (Auth), `worker/auth.js` exige `env.SESSION_SECRET` para
assinar/verificar sessões (`core/session.js`) — sem ele, `POST
/api/auth/login` lança em vez de emitir um cookie. Provisionar com:

```bash
npx wrangler secret put SESSION_SECRET
```

**Pendente/bloqueante para deploy real** (assim como os 3 buckets R2 —
ver acima): este comando ainda não foi executado neste ambiente; sem o
secret configurado, `wrangler dev`/`deploy` sobem mas qualquer chamada a
`/api/auth/login` falha com erro 500 ("SESSION_SECRET ausente em env").

## Comandos locais

```bash
npm install
npm test                 # node --test — suíte completa
npm run validate:schemas # valida schemas/*.schema.json
npm run dev               # wrangler dev
npx wrangler deploy --dry-run  # valida wrangler.toml sem publicar

# Etapa 6 — Publicador
npm run generate:cities        # regenera business/data/cities-catalog.generated.js (IBGE)
npm run rebuild:listing -- <listingId>
npm run rebuild:broker -- <brokerId>
npm run rebuild:city -- <citySlug>
npm run rebuild:all            # 1 lote e para; use -- --all para processar até terminar

# Etapa 9 — módulo feeds (§46)
npm run generate:feeds              # regenera feeds/{portal}.xml em R2 DATA (todos os portais registrados)
npm run generate:feeds -- olx       # só um portal
```
