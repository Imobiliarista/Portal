# Módulos

Ver §38-§52 e §67 do documento normativo. Regra de dependência (§39):

```text
permitido:  modules → business → core → storage
proibido:   core → modules
```

Core nunca importa de `modules/`. Um módulo pode ficar totalmente ausente
sem quebrar o portal, o painel ou o admin.

## Status

Todos os módulos da Etapa 9/10 estão implementados, exceto `ai-search`
— placeholder por decisão de produto (§42: IA não é dependência da busca
básica), não uma pendência. Um módulo ainda placeholder existe só como
`index.js` + `README.md` próprios (ver §67 para a árvore exata de
arquivos de cada um) — nenhuma lógica de negócio implementada nele.

| Módulo | Etapa prevista | Status | Observação |
| --- | --- | --- | --- |
| `appointments` (agendamento-visita) | 9 | **implementado** | Na prática é um formulário de contato geral (sem data/horário), 100% client-side, redireciona para o WhatsApp do corretor — sem persistência em R2/Worker (§41, ver `modules/appointments/README.md`) |
| `ai-search` (busca-ia) | 9 | placeholder | IA não é dependência da busca básica (§42) |
| `saved-search` (busca-salva-email) | 9 | **implementado** | Visitante público sem login; double opt-in por e-mail (Resend) + limite por IP/dia; notificação disparada no hook de publicação, sem cron (§43, ver `modules/saved-search/README.md`) |
| `financing-calculator` (calculadora-financiamento) | 9 | **implementado** | 100% client-side (SAC): `validateFinancingInput`/`buildSacSchedule`/`summarizeSchedule`/`calculateFinancing`, config própria em `config.js` — sem Worker (§44, ver `modules/financing-calculator/README.md`) |
| `comparison` (comparação de anúncios) | 9 | **implementado** | 100% client-side sobre `listings/{slug}.json` já carregados — seleção persistida via `storage` injetável (`localStorage` no browser), sem Worker (§45, ver `modules/comparison/README.md`) |
| `feeds` (feed para portais externos) | 9 | **implementado** | "Modo Exportação": opt-in por submódulo (`broker.modules.feeds.{id}.enabled`), um arquivo agregado por submódulo em R2 DATA. Só o formatter `vrsync` (OLX/ZAP/VivaReal) existe hoje — arquitetura de registry permite adicionar outros sem mudar `generator.js` (§46, ver `modules/feeds/README.md`) |
| `publications` (publicações/blog) | 9 | **implementado** | Descobre/consome o feed Atom do Blogger a partir do link que o corretor cola no painel (`resolveBloggerFeedUrl`) — parsing 100% client-side, só Blogger é suportado (§47, ver `modules/publications/README.md`) |
| `pwa` | 9 | **implementado** | Isolado — não é dependência do portal (§48). Ver `modules/pwa/README.md` |
| `tour-360` | 9 | **implementado** | Campo `tour360` do anúncio já validado em `business/listings.js` desde a Etapa 3 — este módulo é só a camada de consumo pelo frontend, sem mover a validação (§39 proíbe `business/` depender de `modules/`) (§49, ver `modules/tour-360/README.md`) |
| `video-youtube` | 9 | **implementado** | Mesmo padrão de `tour-360`: campo `video` já validado em `business/listings.js` desde a Etapa 3, módulo é só a camada de consumo (§50, ver `modules/video-youtube/README.md`) |
| `financial` | 10 | **implementado (desativado por flag)** | Integração Asaas sandbox completa, atrás de `FINANCIAL_ENABLED` (default `"false"`) — nenhum endpoint chama o Asaas enquanto a flag não for `"true"`. Transações continuam no Worker (§51, ver `modules/financial/README.md`) |
| `plans` | 10 | **implementado** | Camada de consulta sobre `business/plans.js` (schema/CRUD real, Etapa 8b/10): `catalog.js` (reexport), `features.js` (rótulos de exibição), `eligibility.js` (`isModuleEnabledForBroker`/`getEnabledModulesForBroker` — ainda não conectado a `publications`/`feeds`, decisão de produto adiada) (§52, ver `modules/plans/README.md`) |

`modules/future/` reservado para módulos ainda não especificados.

### `appointments` (§41) — escopo real implementado

§41 é só a árvore de arquivos do módulo, sem definir o fluxo. Confirmado
com o solicitante antes deste lote — e corrigido por ele já durante o
lote, depois de uma primeira leitura errada como "agendamento com data/
horário": **não há marcação de data/hora nenhuma**. O que existe é um
formulário de contato geral com o corretor a partir de um imóvel (nome,
telefone, e-mail, mensagem pré-preenchida e editável), mesmo padrão do
template Houzez (WordPress) usado no mercado imobiliário — não há
aprovação/confirmação dentro da plataforma, e não existe (nem foi
adicionada) infraestrutura de e-mail no projeto. O módulo é 100%
client-side: o formulário monta `https://wa.me/{whatsapp-do-corretor}?text=...`
a partir do `whatsapp` já existente no perfil público do corretor (§16,
já suportado por `business/brokers.js` desde a Etapa 3). Sem nada para
persistir, não há gaveta em R2 PRIVATE, rota de Worker, nem tela de
"contatos recebidos" no painel — decisões completas em
`modules/appointments/README.md`.

### `saved-search` (§43) — escopo real implementado

§43 é só a árvore de arquivos (`index.js`, `service.js`,
`notifications.js`, `README.md`), sem uma linha sobre o fluxo. Três pontos
confirmados com o solicitante antes de qualquer código: (1) visitante
público do portal salva a busca, sem login — nenhum brokerId/tenant
envolvido; (2) anti-abuso é double opt-in por e-mail + limite simples por
IP/dia contado em R2 PRIVATE (sem KV/D1/Durable Objects no projeto); (3) a
notificação é disparada direto do fluxo de publicação — `worker/api.js`
chama `checkSavedSearchesForListing` logo depois de cada `publishListing`
bem-sucedido, mesmo hook que já liga `modules/feeds` ali, **sem** cron
novo (`worker/cron.js` continua placeholder, sem `[triggers]`). Primeiro
módulo do projeto a integrar um provedor de e-mail (Resend, domínio
`imobiliarista.net` já verificado) — decisões completas, incluindo o que
ficou de fora (frontend, dedup por e-mail, retry de envio, reconciliação
de rebuild em lote), em `modules/saved-search/README.md`.

### `financial` (§51) — escopo real implementado

Integração completa com a API sandbox do Asaas (cliente + cobrança de
taxa de implantação/mensalidade do plano + webhook de confirmação de
pagamento), mas **desativada por flag** — pedido explícito deste lote,
Etapa 10 fecha aqui. `env.FINANCIAL_ENABLED` precisa ser exatamente a
string `"true"` (default `"false"`, `wrangler.toml` `[vars]`) para
qualquer função do módulo sequer montar uma `Request` para o Asaas —
checado em três camadas independentes (`checkout.js`/`payments.js` antes
de tocar R2, `provider.js` de novo antes do `fetch`, `webhook.js` antes de
processar qualquer evento de entrada). Toggle reaproveita o mecanismo de
env var/secret que o projeto já usa para outras integrações externas
(`RESEND_API_KEY` etc.) em vez de um sistema novo — pode ser ligado sem
redeploy de código (edição direta da var no dashboard Cloudflare), com uma
ressalva documentada (um `wrangler deploy` de rotina reaplica o `"false"`
commitado). `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` estão **pendentes de
provisionamento** — nenhuma credencial sandbox existe para este projeto
ainda, não inventado — decisões completas, incluindo tudo que ficou de
fora (UI no painel, visão SuperAdmin, enforcement de inadimplência), em
`modules/financial/README.md`.

### `pwa` (§48) — escopo real implementado

Manifest + service worker do **portal público** (só; minisite/painel/admin
ficaram de fora deste lote — ver `modules/pwa/README.md#decisões`).
`frontend/manifest.json` e `frontend/service-worker.js` são Static Assets
reais, **gerados** (não escritos à mão) por `npm run generate:pwa` a
partir de `modules/pwa/manifest.js` e `modules/pwa/service-worker.js` —
nenhuma rota de Worker foi adicionada (§94, §73). O único ponto de
contato com o portal é um registro opcional em `frontend/index.html`,
que falha em silêncio se o módulo for removido.
