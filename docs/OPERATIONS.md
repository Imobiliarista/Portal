# Operações

## Publicação de read models R2 (corrige o "Carregando…" eterno em produção)

**Causa raiz** (confirmada nesta sessão): `storage/keys.js#dataKeys.portalCities/portalTaxonomy/portalModules`
sempre soube nomear `portal/cities.json`/`portal/taxonomy.json`/`portal/modules.json`,
e `frontend/portal/data.js`/`app.js` sempre soube LER esses 3 objetos — mas
nenhum código em `business/` jamais os ESCREVIA. `GET
https://dados.imobiliarista.net/portal/cities.json` sempre respondia
404/CORS, e o frontend antigo colapsava essa falha em uma promessa sem
tratamento — a tela ficava presa em "Carregando…" para sempre. Corrigido
por dois lados independentes:

1. **Geração dos 3 catálogos** (`business/taxonomy.js`,
   `business/catalogs.js`, `business/publishing.js#publishPortalCatalogs`)
   — agora sempre produzidos, inclusive vazios e válidos (`{"cities":
   []}`, nunca 404) quando `IMOB_PRIVATE` não tem nenhum corretor/imóvel.
2. **Frontend com estados distintos** (`frontend/shared/public-data-errors.js`,
   `frontend/portal/{data,app,render}.js`, `frontend/minisite/{data,app}.js`)
   — 404 real, erro HTTP, falha de rede/CORS e JSON inválido nunca mais
   colapsam numa promessa sem tratamento; cada um renderiza um estado
   final (nunca "Carregando…" indefinido) com "Tentar novamente" quando
   aplicável.

Publicar esses 3 catálogos em produção pela primeira vez (e sempre que
`IMOB_PRIVATE` mudar por fora do fluxo normal do painel) usa o workflow
manual e protegido abaixo — nunca escrita automática em push, nunca deploy
do Worker.

### Recursos esperados

```text
IMOB_PRIVATE → imob-private   (sem Custom Domain, nunca público)
IMOB_DATA    → imob-data      (Custom Domain: dados.imobiliarista.net)
IMOB_MEDIA   → imob-media     (Custom Domain: media.imobiliarista.net)
```

`imob-private` **não pode** ter Custom Domain nem URL pública — é lido
apenas pelo Worker (rotas `/api/*`) e pelo adapter/executor abaixo, nunca
pelo visitante.

### Aplicar a política CORS versionada (painel Cloudflare)

O conteúdo canônico está em [`config/r2/imob-data-cors.json`](../config/r2/imob-data-cors.json)
(validado localmente por `npm run validate:r2-cors` — só `GET`/`HEAD`,
sem headers de autenticação, sem domínio privado). Aplicar manualmente,
uma vez (e sempre que o arquivo mudar):

1. Cloudflare Dashboard;
2. R2 Object Storage;
3. bucket `imob-data`;
4. Settings;
5. CORS Policy;
6. Add CORS policy;
7. colar o conteúdo de `config/r2/imob-data-cors.json`;
8. Save;
9. aguardar propagação (minutos, não instantâneo);
10. executar Purge Cache para `dados.imobiliarista.net`.

Respostas já em cache de antes da política CORS existir podem continuar
sem os cabeçalhos novos até o purge — por isso o passo 10 não é opcional.
Repita os mesmos 10 passos para o bucket `imob-media` (mesmo conteúdo,
já que ambos são leitura pública somente-GET/HEAD).

### GitHub Environment `production-r2`

Antes da primeira publicação, criar no repositório (Settings → Environments):

```text
Environment: production-r2
Secret:      CLOUDFLARE_API_TOKEN     (token com permissão de editar objetos R2 —
                                        "Workers R2 Storage: Edit" — escopo
                                        mínimo necessário; não reutilizar um
                                        token de deploy do Worker aqui)
Variable:    CLOUDFLARE_ACCOUNT_ID
Reviewer:    proprietário autorizado do repositório (obrigatório —
             sem isso qualquer `publish` aprovado por qualquer colaborador
             passaria direto)
```

### Primeira publicação

1. GitHub → aba **Actions**;
2. escolher **"Validar e publicar read models no R2"**;
3. **Run workflow**, branch `main`;
4. modo `validate`, executar — confere que a suíte inteira, os schemas, a
   política CORS e o adapter (contra fixtures locais, sem credenciais)
   passam;
5. confirmar sucesso total no resumo do job;
6. **Run workflow** de novo, modo `publish`, campo de confirmação com
   exatamente `PUBLICAR_R2`;
7. iniciar;
8. aprovar o Environment `production-r2` quando solicitado;
9. aguardar;
10. no resumo do job `publish`, confirmar "Exclusões: nenhuma" e "Deploy
    do Worker: NÃO executado";
11. verificar os 3 objetos (próxima seção).

### Verificação pós-publicação

Estas URLs devem responder `200` com JSON válido — nunca HTML/404 — mesmo
antes de qualquer corretor existir (a primeira pode ser um catálogo vazio,
`{"cities": []}`, o que é um sucesso, não uma falha):

```text
https://dados.imobiliarista.net/portal/cities.json
https://dados.imobiliarista.net/portal/taxonomy.json
https://dados.imobiliarista.net/portal/modules.json
```

Testar CORS a partir do navegador em `https://imobiliarista.net` (DevTools
→ Console):

```js
fetch("https://dados.imobiliarista.net/portal/cities.json")
  .then((r) => console.log(r.status, r.headers.get("access-control-allow-origin"), r.headers.get("content-type")))
```

Esperado: `200`, `access-control-allow-origin: *` (ou o valor específico
configurado), `content-type: application/json...`. Se o CORS ainda não
tiver propagado, veja o passo 9 (purge) acima.

### Rerun seguro — o que nunca publica sozinho

- Abrir a tela de Actions **não** publica.
- Rodar o modo `validate` **nunca** publica (não recebe nenhuma credencial
  — `scripts/r2-read-models.js validate` roda inteiramente contra
  fixtures locais em memória).
- Selecionar `publish` sem digitar exatamente `PUBLICAR_R2` **não**
  publica (o job nem inicia — guard no `if:` do workflow).
- Rodar em qualquer branch além de `main` **não** publica.
- Reprovar o Environment `production-r2` **não** publica.
- Este workflow **nunca** roda `wrangler deploy`/`wrangler versions
  upload` — o Worker ativo não é tocado.
- Este workflow **nunca** altera DNS, bindings ou secrets do Worker.
- O adapter (`business/r2ReadModelsAdapter.js`) **não oferece** nenhuma
  operação de exclusão — só `create`/`update`/`unchanged`.

### Comandos locais equivalentes

```bash
npm run r2-read-models:validate   # mesmo que o job `validate` do workflow — sem credenciais
npm run r2-read-models:publish    # exige CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
                                   # IMOB_R2_ENVIRONMENT=production-r2 e
                                   # IMOB_R2_AUTHORIZATION=PUBLICAR_R2 no ambiente —
                                   # rodar fora do workflow só para depuração local,
                                   # nunca como substituto do Environment protegido
npm run validate:r2-cors          # valida config/r2/imob-data-cors.json
```

## Pendências não-bloqueantes (§27 hotfix — PBKDF2 no navegador)

13. **`PASSWORD_PEPPER` PENDENTE de provisionamento.** `wrangler secret put
    PASSWORD_PEPPER` precisa rodar antes deste hotfix ir para produção —
    sem ele, `worker/auth.js#passwordPepper` lança e `/api/auth/salt` e
    `/api/auth/login` ficam fora do ar (falha explícita, não um 500
    silencioso). Ver `core/auth.js` e `business/auth.js` para onde o
    secret é consumido.
14. ~~Sem testes neste lote~~ **Resolvido na Etapa 11.** Este hotfix
    (§27) quebrou 128 de 472 testes (fixtures simulando o fluxo de login
    antigo por e-mail+senha) — consertado no sub-lote 1/N da Etapa 11
    (PR #23, ver `docs/CHANGELOG.md`), que reescreveu os fixtures para o
    contrato atual (CPF + PBKDF2 client-side + HMAC) sem tocar código de
    produção. O sub-lote 2/N (PR #24) foi além e cobriu módulos que nunca
    tinham tido teste nenhum (`modules/financial`, `modules/saved-search`,
    `modules/plans/eligibility.js`, `core/app.js`, `worker/index.js`).
    Estado atual: 579 testes, 0 falhas.
15. **Sem rota de autocadastro/definição de senha via HTTP ainda** —
    `setAuthPassword` continua só provisionamento admin/script (roda o
    PBKDF2 localmente, fora de um handler do Worker). Um futuro fluxo de
    signup/redefinição de senha self-service precisa seguir o mesmo padrão
    de `login`: aceitar o resultado do PBKDF2 já derivado pelo navegador,
    nunca a senha em texto puro num handler do Worker (senão reintroduz o
    mesmo estouro de CPU que este hotfix corrige).
16. **CPF agora é campo obrigatório em `createBroker`** (decisão tomada
    neste lote: sem CPF, um corretor nunca conseguiria logar, já que CPF
    substituiu e-mail como identificador de login). Não há migração porque
    ainda não há usuários reais (confirmado pelo solicitante) — mas
    qualquer script/seed existente que chame `createBroker` sem `cpf`
    passa a falhar. Exceção: a conta especial TESTE (item 18 abaixo), via
    `{ allowMissingCpf: true }`.
17. **`LOGIN_INDEX_SECRET` PENDENTE de provisionamento** (§27 hotfix
    pt.3). `wrangler secret put LOGIN_INDEX_SECRET` precisa rodar junto
    com `PASSWORD_PEPPER` (item 13) antes de produção. `/api/auth/salt` e
    `/api/auth/login` (`worker/auth.js#loginIndexSecret`, resolvido sempre,
    já que todo login precisa dele) lançam sem ele — falha explícita, não
    um 500 silencioso. `PUT /api/me/profile`
    (`worker/api.js#handlePutProfile`) é mais tolerante: só passa
    `env.LOGIN_INDEX_SECRET` adiante (possivelmente `undefined`) para
    `business/brokers.js#updateBrokerProfile`, que só exige o secret
    quando o patch de fato muda `email`/`cpf` — editar telefone/sobre/logo
    continua funcionando mesmo sem o secret provisionado ainda.
    Deliberadamente um secret separado de `PASSWORD_PEPPER`: protege o
    índice de lookup CPF/e-mail
    (`storage/indexes.js#loginIdentifierHash`, agora HMAC-SHA256 em vez de
    SHA-256 puro — o SHA-256 puro anterior era força-bruteável para CPF,
    espaço de ~10^8 valores válidos), não o verificador de senha.
18. **Contas especiais MASTER/TESTE — runbook de provisionamento** (§27
    hotfix pt.2). Allowlist exata e fechada de dois identificadores
    (`business/auth.js#SPECIAL_IDENTIFIERS`), case-insensitive/trim, sem
    CPF, sem sistema genérico de login por username. MASTER é SuperAdmin
    de homologação sem corretor associado; TESTE é uma conta
    comercial/anunciante de homologação (role "broker") com um corretor de
    verdade, mas sem CPF. Nenhuma das duas existe até ser provisionada —
    até lá, `/api/auth/salt`/`/api/auth/login` respondem com o mesmo salt
    dummy/erro genérico de sempre (§26), nunca revelando que ainda não
    foram criadas. **Caminho preferido**: `npm run bootstrap:special-accounts`
    (`scripts/bootstrap-special-accounts.js`) — CLI interativa que pede as
    duas senhas no terminal (nunca como argumento/hardcoded, eco desligado
    durante a digitação), é idempotente (avisa e pede confirmação extra
    antes de sobrescrever uma conta já provisionada) e chama exatamente as
    mesmas funções do runbook abaixo por baixo dos panos. O snippet
    seguinte documenta o que a CLI faz internamente — use-o direto no
    console só se precisar de algo fora do que a CLI cobre (ex.: um
    `userId`/`brokerId` diferente dos fixos que ela usa por padrão):

    ```js
    import { createBroker } from "./business/brokers.js";
    import { provisionSpecialAccount } from "./business/auth.js";

    // MASTER — sem broker, role superadmin.
    await provisionSpecialAccount(env, "MASTER", "user_master_homolog", "senha-temporaria-forte", {
      pepper: env.PASSWORD_PEPPER,
    });

    // TESTE — corretor de verdade (sem cpf), role broker.
    const testeBroker = await createBroker(
      env,
      {
        userId: "user_teste_homolog",
        slug: "teste-homologacao", // "teste" sozinho é reservado (business/brokers.js#RESERVED_SLUGS)
        name: "Conta de teste (homologação)",
        plan: "internal",
        status: "active",
      },
      { loginIndexSecret: env.LOGIN_INDEX_SECRET, allowMissingCpf: true },
    );
    await provisionSpecialAccount(env, "TESTE", testeBroker.userId, "outra-senha-temporaria", {
      pepper: env.PASSWORD_PEPPER,
      brokerId: testeBroker.brokerId,
    });
    ```

    Ambos os registros ficam marcados `temporary: true`
    (`indexes/login-special/{master,teste}.json`). **Antes de produção
    definitiva**: trocar a senha (reprovisionar via
    `provisionSpecialAccount` com uma senha nova) ou desativar (apagar o
    registro `login-special/{kind}.json` via `storage/private.js#deletePrivate`
    manualmente — não há endpoint HTTP para isso, nem fluxo de troca de
    senha self-service). Não há enforcement automático de "senha
    temporária" no login em si — é um passo manual de checklist, não uma
    trava no código.
19. **Contrato de wire mudou de `cpf`/`email` para `identifier`** (§27
    hotfix pt.2): `POST /api/auth/salt` e `POST /api/auth/login` agora
    recebem `{ identifier }`/`{ identifier, pbkdf2Result }` — qualquer
    integração externa (nenhuma existe hoje, mas fica registrado) que
    ainda mandasse `{ cpf, ... }` (contrato do primeiro lote deste
    hotfix, nunca chegou a produção) precisa atualizar.

## Pendências não-bloqueantes (Etapa 10, módulo financial — Asaas sandbox, §51)

24. **Nenhuma credencial/API key sandbox do Asaas existe para este
    projeto.** `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` (ambas via
    `wrangler secret put`, ver `wrangler.toml`) estão **PENDENTES de
    provisionamento** — não inventadas, não assumidas. Sem elas,
    `modules/financial/provider.js#apiKey` lança (falha explícita) e
    `modules/financial/webhook.js#handleAsaasWebhook` recusa qualquer
    requisição com 503. Nenhuma conta Asaas (nem sandbox) foi criada até
    onde esta sessão sabe.
25. **Módulo inteiro desativado por flag (`FINANCIAL_ENABLED`, default
    `"false"` em `wrangler.toml` `[vars]`)** — decisão explícita deste
    lote (§51 "DESATIVADO por flag"). Mecanismo escolhido reaproveita o
    padrão de env var/secret já usado no projeto (não um sistema de
    toggle novo) — ver `modules/financial/README.md#decisões` para o
    porquê e a ressalva operacional: um `wrangler deploy` de rotina
    reaplica o `"false"` commitado, então ativar via dashboard sem também
    atualizar `wrangler.toml` não sobrevive ao próximo deploy de código.
26. **Nada foi exercitado contra a sandbox de verdade** (consequência
    direta da pendência 24). Base URL, headers e campos dos endpoints
    (`POST /customers`, `POST /payments`, webhook) foram confirmados nesta
    sessão via WebSearch contra `docs.asaas.com` — reconferir contra a
    documentação oficial (e uma chamada real) antes de ativar em produção.
27. **Nenhum webhook cadastrado no Asaas** — `POST /api/webhooks/asaas`
    existe e está pronto, mas não há conta Asaas para cadastrá-lo
    (`POST /v3/webhooks` na API do Asaas, ou pelo painel deles, fora do
    escopo de código deste lote).
28. **Sem enforcement de inadimplência** — nenhuma suspensão automática de
    corretor por cobrança vencida/não paga. Conectar isso a
    `business/brokers.js#suspendBroker` (ou equivalente) é uma decisão de
    produto explicitamente fora de escopo deste lote.
29. **Sem UI no painel do corretor** para a área "financeiro" (§54) — só o
    backend (`/api/me/financial/checkout`, `/api/me/financial/charges*`)
    foi construído.
30. **Sem visão SuperAdmin sobre cobranças** — `worker/admin.js` não ganhou
    rota para listar cobranças entre corretores; cada corretor só vê as
    próprias.

## Pendências não-bloqueantes (Etapa 10, módulo plans — schema/CRUD ampliado + eligibility, §52)

20. **`business/plans.js#getActiveListingLimitForBroker` existe mas nada o
    chama.** Este lote reverte a decisão "fora de escopo" da Etapa 8b
    (pendência 7 abaixo) e adiciona `maxActiveListings` ao registro de
    plano + um resolvedor, mirroring `getGalleryLimitForBroker`. Mas
    nenhum enforcement foi adicionado — `business/listings.js#createListing`
    não chama esse resolvedor, então um corretor pode ter mais anúncios
    ativos do que o limite do plano dele permite sem que nada bloqueie.
    Wiring isso exigiria confirmação prévia (mudaria comportamento já em
    produção de `createListing`) — não foi assumido neste lote.
21. **`modules/plans/eligibility.js` não está conectado a nada.**
    `isModuleEnabledForBroker`/`getEnabledModulesForBroker` existem e
    funcionam, mas nem `modules/publications` nem `modules/feeds` os
    chamam — os dois continuam utilizáveis por qualquer corretor
    independente do `modules` do plano dele. Mesmo raciocínio da pendência
    20: conectar mudaria comportamento de dois módulos já em produção,
    decisão explicitamente deixada para confirmação posterior (ver
    `modules/plans/README.md`).
22. **Preço (mensalidade/implantação) já é lido, mas nada cobra de verdade
    ainda.** `monthlyPrice`/`setupPrice` são lidos por
    `modules/financial/checkout.js` (lote separado, §51, ver pendência 24
    abaixo) desde que o corretor peça um checkout — mas o módulo inteiro
    está atrás de `FINANCIAL_ENABLED` (default `"false"`), então nenhuma
    cobrança real do Asaas dispara a partir desses valores até a flag ser
    ligada com credenciais reais provisionadas.
23. **`frontend/admin/render.js#PLAN_MODULE_FIELDS` duplica
    `business/plans.js#PLAN_MODULE_KEYS` por valor**, não por import —
    `frontend/admin/` nunca importa de `business/`/`modules/` (Workers
    Static Assets só publica `frontend/`), mesmo limite que já existia
    para outros campos deste formulário. Adicionar uma chave nova em
    `PLAN_MODULE_KEYS` sem atualizar essa lista no admin faz o checkbox
    correspondente não aparecer no formulário (o backend aceitaria o
    campo normalmente via API direta, só a UI ficaria desatualizada).

## Pendências não-bloqueantes (Etapa 9, módulo feeds — "Modo Exportação")

9. **Submódulo vrsync sem revisão contra a documentação oficial completa.**
   O acesso de rede desta sessão ficou bloqueado o tempo todo para
   `developers.grupozap.com` — a estrutura raiz e a lista de campos a
   mapear vieram diretamente do solicitante (colada no chat), mas
   `PropertyType` (lista completa) e o item de vídeo em `<Media>` vieram
   de WebSearch com exemplos citados, não da página em si. Antes de
   cadastrar `https://dados.imobiliarista.net/feeds/vrsync.xml` num
   portal de verdade (OLX/ZAP/VivaReal), reabrir
   `developers.grupozap.com/feeds/vrsync/elements/` de um ambiente com
   rede liberada e diferenciar contra `modules/feeds/formatters/vrsync.js`
   (ver `modules/feeds/README.md#decisões` para o que especificamente
   ficou pendente).
10. **`FEED_CONTACT_EMAIL`/`FEED_CONTACT_PHONE`**: vars opcionais (não
    segredo) lidas por `modules/feeds/generator.js#buildFeedHeader` para o
    `<Header>` do XML — sem elas, o feed sai com um e-mail placeholder e
    sem telefone. Configurar em `[vars]` no `wrangler.toml` antes de
    produção.
11. **Custom Domain de R2 DATA** (mesma pendência bloqueante 3 abaixo) é
    também o que torna o feed alcançável pelo robô do portal — sem ele,
    `feeds/vrsync.xml` existe no bucket mas não tem URL pública nenhuma.
12. **Só o submódulo `vrsync` existe.** A arquitetura de registry
    (`modules/feeds/registry.js`) já deixa claro onde um submódulo novo
    entraria, mas nenhum outro foi implementado neste lote.

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
     cpf: "00000000000", // §27 hotfix: CPF é o identificador de login agora — obrigatório em createBroker
   });
   await setAuthPassword(env, broker.userId, "senha-forte-aqui", {
     role: "superadmin",
     pepper: env.PASSWORD_PEPPER, // secret vivo — ver pendência do PASSWORD_PEPPER nesta etapa
   });
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
   para o sistema de planos. **Atualização Etapa 10**: o campo
   (`maxActiveListings`) e o resolvedor (`getActiveListingLimitForBroker`)
   agora existem — ver pendência 20 acima para o porquê de ainda não
   haver enforcement.
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
4. **CORS no Custom Domain de R2 DATA/MEDIA** (§80) — mesma categoria do
   item 3 (config manual no painel Cloudflare, nunca existiu por padrão).
   **Atualizado**: a definição canônica e versionada agora é
   [`config/r2/imob-data-cors.json`](../config/r2/imob-data-cors.json) —
   ver a seção "Publicação de read models R2" no topo deste documento para
   o passo a passo de aplicação. Essa política usa `AllowedOrigins: ["*"]`
   (leitura pública irrestrita, só `GET`/`HEAD`) em vez de uma allowlist de
   origem: `IMOB_DATA` contém exclusivamente projeções públicas (nunca
   dado privado — isso é garantido pelo publicador,
   `business/publishing.js`/`business/r2ReadModelsAdapter.js`, nunca pelo
   CORS), e o R2 não valida wildcards parciais de subdomínio de forma
   confiável (`https://*.imobiliarista.net` não é uma origem CORS válida
   para todo minisite por corretor), então restringir a origem não reduz
   exposição real e quebraria minisites novos até a allowlist ser
   atualizada manualmente. `core/security.js#PUBLIC_READ_CORS_HEADERS`/
   `buildCorsHeaders` continuam existindo e testados
   (`tests/core/security.test.js`) como a política que um Worker
   aplicaria SE algum dia servisse uma leitura de R2 diretamente — hoje
   nenhum serve (§73/§89), então esse código nunca é exercitado em
   produção; não confundir com a política que de fato vai no painel.

## Pendências não-bloqueantes (Etapa 11, sub-lote 5 — revisão headers/CORS/cache)

5. **`SECURITY_HEADERS` (CSP/§81) nunca alcança as páginas reais do
   portal/painel/admin/minisite** — só respostas que este Worker constrói
   (`/api/*` + as 3 páginas HTML públicas de
   `modules/saved-search/index.js`) passam por
   `core/app.js`/`applySecurityHeaders`. As páginas de fato servidas por
   Workers Static Assets (`wrangler.toml` `run_worker_first = ["/api/*"]`,
   §73/§89 "estático nunca invoca o Worker") nunca recebem CSP/HSTS/etc.
   hoje. Cloudflare Workers Static Assets suporta um arquivo `_headers`
   na raiz de `frontend/` para isso — não adicionado neste lote porque o
   `connect-src` da CSP atual é incompatível com um recurso já em
   produção: `modules/publications/index.js#resolveBloggerFeedUrl`/
   `parseAtomFeed` fazem `fetch()` cross-origin direto do Browser para um
   domínio Blogger arbitrário informado pelo corretor (`*.blogspot.com`
   ou um domínio customizado apontado para o Blogger) —
   `modules/publications/README.md#pendências` já registrava que a CSP
   "não alcança" essas páginas, mas não que isso deixaria de ser
   verdade ao adicionar um `_headers`. Decisão de produto necessária
   antes de ligar isso: permitir `https://*.blogspot.com` no `connect-src`
   cobre o caso comum mas quebra um domínio customizado; deixar
   `connect-src` sem restrição só no minisite é a alternativa mais
   simples, mas reduz a proteção da CSP ali. `frame-src
   https://www.youtube-nocookie.com` (necessário pelo iframe de
   `modules/video-youtube`, §50) já foi adicionado à definição em
   `core/security.js` neste lote — só não estava lá porque, com a CSP
   nunca alcançando o portal, nada notava a falta.

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

Etapa 9 (§43, módulo saved-search) adiciona mais dois secrets, mesmo
padrão acima — **ambos PENDENTES** de provisionamento:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put SAVED_SEARCH_TOKEN_SECRET
```

`RESEND_API_KEY` autentica `modules/saved-search/notifications.js` contra
a API do Resend (provedor e domínio `imobiliarista.net` — já verificado
na conta Resend — decididos fora deste lote, instrução explícita do
solicitante). `SAVED_SEARCH_TOKEN_SECRET` assina os tokens de
confirmação/cancelamento (`modules/saved-search/service.js`, reaproveita
`core/session.js#createSessionToken`/`verifySessionToken`) — deliberadamente
um secret próprio, nunca `SESSION_SECRET`: um token de busca salva não é
uma sessão de corretor, e reaproveitar o mesmo segredo entre os dois usos
misturaria dois espaços de assinatura sem necessidade. Sem os dois
secrets, `POST /api/saved-searches` e os links de confirmação/cancelamento
lançam em vez de um 500 silencioso (mesmo espírito de falha explícita do
`PASSWORD_PEPPER` acima).

## Pendências não-bloqueantes — módulo saved-search (§43)

1. ~~Sem testes neste lote~~ **Coberto na Etapa 11 (sub-lote 2/N, PR #24)**:
   `tests/modules/saved-search/{service,notifications,index}.test.js`
   cobrem `modules/saved-search/*` inteiro (double opt-in, rate-limit,
   tokens, `matchesCriteria`, handlers HTTP). Ainda sem teste: o wiring
   em si dentro de `worker/api.js` (`checkSavedSearchesForListing`
   chamado logo após `publishListing`) — coberto só indiretamente, via
   chamada direta à função em isolamento, não através de um
   `POST /api/me/listings` real.
2. **Sem frontend** — nenhuma tela/formulário em `frontend/portal/` ou
   `frontend/minisite/` para o visitante realmente salvar uma busca. O
   pedido deste lote listou só "salvar critério de busca + destinatário,
   endpoint no Worker, verificação de match, disparo do e-mail" — a UI
   fica para um lote futuro. Os links de confirmação/cancelamento do
   e-mail apontam direto para as rotas do Worker (que respondem com uma
   página HTML mínima própria, não JSON), então o fluxo funciona ponta a
   ponta mesmo sem essa UI existir ainda.
3. **Sem deduplicação por e-mail/critério.** Salvar a mesma busca (mesmo
   e-mail + mesmos filtros) mais de uma vez cria um registro novo a cada
   vez — não existe índice por e-mail (só por cidade, para o match), e
   checar "já existe uma busca igual" exigiria ou um índice novo ou
   escanear `saved-searches/` (proibido, §26). Consequência prática: um
   visitante que clica "salvar" 3 vezes recebe 3 e-mails de confirmação e,
   se confirmar os 3, 3 alertas idênticos por imóvel novo.
4. **Limite por IP/dia é best-effort, não atômico.** O contador em R2
   PRIVATE (`storage/keys.js#privateKeys.savedSearchRateLimit`) é um
   read-then-write simples — duas requisições da mesma origem chegando
   quase juntas podem subcontar em 1 (uma corrida de leitura). Aceitável
   para um limite de dissuasão (5/dia por IP); não é uma garantia dura.
   PUT condicional (ETag) do R2 resolveria, mas é complexidade não
   justificada para este mecanismo (§94).
5. **E-mail de alerta sem fila/retry dedicado.** Se o envio ao Resend
   falhar no momento do hook de publicação, o registro NÃO é marcado como
   notificado (para permitir nova tentativa) — mas só existe uma nova
   tentativa se aquele mesmo anúncio for publicado de novo (outra edição).
   Um anúncio que dá match, falha o envio, e nunca mais é editado nunca
   chega a notificar aquele visitante. Sem Queue/cron neste lote (decisão
   3 do solicitante — hook direto, sem mecanismo de reconciliação).
6. **Notificação só no caminho normal de escrita do painel.** O hook fica
   em `worker/api.js` (create/update/delete de anúncio via
   `/api/me/listings/*`) — `rebuildCity`/`rebuildAll`/`republishBrokerListings`
   (business/publishing.js, usados por scripts de rebuild em lote e pela
   suspensão/reativação de corretor) chamam `applyCardToCity` diretamente,
   não passam por esses 3 handlers, e portanto não disparam
   `checkSavedSearchesForListing`. Um imóvel que só aparece/reaparece via
   rebuild em lote não gera alerta. Trade-off explícito da decisão 3
   (hook direto, sem cron de reconciliação) — ver
   `modules/saved-search/README.md#pendências`.
7. **Match de `type`/`district` é case-sensitive, comparação exata.** Sem
   evidência de que os valores gravados variam de caixa (o painel usa uma
   lista fixa, presumivelmente), não foi adicionada normalização — se isso
   se provar um problema real, é uma mudança pequena e local em
   `modules/saved-search/service.js#matchesCriteria`.

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

# Etapa 9 — módulo feeds, "Modo Exportação" (§46)
npm run generate:feeds              # regenera frontend/shared/feeds.generated.js (bundle do painel)
npm run rebuild:feeds               # regenera feeds/{submódulo}.xml em R2 DATA (todos os submódulos registrados)
npm run rebuild:feeds -- vrsync     # só um submódulo

# §27 hotfix pt.2 — provisionamento manual de MASTER/TESTE (pendência 18)
npm run bootstrap:special-accounts  # pede as senhas interativamente, nunca hardcoded
```
