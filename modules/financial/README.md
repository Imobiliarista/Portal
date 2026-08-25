# Módulo: financial

Ver §51 (e §38-§40, §52-§54, §67, §90) de
`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`. §51 é só a árvore
de arquivos do módulo + uma linha de restrição:

```text
modules/financial/
├── index.js
├── checkout.js
├── payments.js
├── provider.js
└── webhook.js
└── README.md
```

> Transações continuam no Worker.

Nenhuma linha sobre o fluxo em si (o que é cobrado, quando, como o Asaas
entra). Pedido explícito deste lote: implementação completa contra a API
sandbox do Asaas, mas **DESATIVADA por flag** — nenhum endpoint de
checkout/pagamento pode sequer chamar o Asaas com o módulo no estado
padrão (desligado). Etapa 10 fecha depois deste lote — sem lote seguinte
imediato.

## Decisões tomadas

1. **Kill switch: `env.FINANCIAL_ENABLED` (string `"true"`/qualquer outro
   valor), não um mecanismo novo.** Pedido explícito: "confira como isso
   já é feito em outro lugar antes de inventar um mecanismo novo". O
   projeto não tem um toggle *global* de módulo pré-existente — o único
   precedente de "liga/desliga sem redeploy" é o `broker.modules.feeds[
   submodule].enabled` (`modules/feeds/config.js`), mas esse é um opt-in
   **por corretor**, guardado em R2, e `business/plans.js#PLAN_MODULE_KEYS`
   exclui `financial` de propósito por ser **plataforma inteira**, não uma
   concessão por plano (ver comentário atualizado em `business/plans.js`).
   Reaproveitado, então, o outro mecanismo já estabelecido no projeto:
   env var/secret lida em runtime (`RESEND_API_KEY`, `SESSION_SECRET`,
   `PASSWORD_PEPPER`, `LOGIN_INDEX_SECRET`, `SAVED_SEARCH_TOKEN_SECRET`) —
   só que como var não-secreta (`[vars]` em `wrangler.toml`, reservado
   desde a Etapa 9 e usado pela primeira vez aqui), porque um booleano não
   é sensível. `modules/financial/provider.js#assertFinancialModuleEnabled`
   roda antes de qualquer `fetch` — ver decisão 2.
   - **Como liga/desliga sem redeploy, na prática**: editar o valor de
     `FINANCIAL_ENABLED` direto no dashboard Cloudflare ("Workers &
     Pages" → o Worker → "Settings" → "Variables and Secrets") não exige
     rodar `wrangler deploy`/pipeline de CI — só cria uma nova versão do
     binding. Isso é o "sem redeploy" pedido.
   - **Ressalva que fica registrada como pendência, não escondida**: o
     valor commitado em `wrangler.toml` (`"false"`) é reaplicado em todo
     `wrangler deploy` de rotina — uma ativação feita só pelo dashboard,
     sem também atualizar o `wrangler.toml`, não sobrevive ao próximo
     deploy de código. Isso é intencional (fail-safe: um deploy nunca liga
     o módulo sem alguém decidir isso explicitamente no arquivo versionado),
     mas é operacionalmente importante — quem for ativar isso de verdade em
     produção precisa saber que também deve atualizar `wrangler.toml` (e
     revisar isso em code review), não só o dashboard.
2. **Defesa em profundidade, não um único gate.** O flag é checado em três
   camadas independentes: `checkout.js#createCheckoutForBroker` e
   `payments.js#syncChargeStatus` checam antes de tocar R2;
   `provider.js#asaasFetch` checa de novo antes de qualquer `fetch` (então
   mesmo um bug futuro que esqueça o primeiro check em algum caminho novo
   não abre uma via de chamada real ao Asaas); `webhook.js#handleAsaasWebhook`
   checa antes de processar qualquer evento de entrada. Nenhuma função
   deste módulo tenta ser "esperta" sobre isso — é sempre o mesmo helper
   (`isFinancialModuleEnabled`/`assertFinancialModuleEnabled`, ambos em
   `provider.js`, reexportados por `index.js`).
3. **Sem `routes.js` no módulo — mas, diferente de `saved-search`, os
   handlers HTTP autenticados (`checkout`/`charges`) NÃO moram dentro de
   `modules/financial/`.** `checkout.js`/`payments.js` são funções de
   negócio puras (`(env, brokerId, ...)`, nenhuma `Request`/`Response`) —
   precisam de sessão de corretor (`requireTenant`,
   `worker/auth.js`), e nenhum módulo deste projeto até agora importa de
   `worker/` (a direção estabelecida, embora §39 só formalize
   "proibido: core → modules", é sempre `worker/ → modules/`, nunca o
   contrário). O handler fino desses dois fica em `worker/financial.js`
   novo — mesmo split que `worker/api.js` já usa para
   `business/listings.js`. Só `webhook.js` define seu próprio handler HTTP
   dentro do módulo (`handleAsaasWebhook`), porque essa rota é pública
   (autenticada por um token compartilhado no header, não por sessão) —
   mesmo caso de `modules/saved-search/index.js`.
4. **Sem seletor de forma de pagamento no checkout** — toda cobrança usa
   `billingType: "UNDEFINED"`, que deixa o próprio Asaas oferecer todas as
   formas de pagamento na fatura (PIX/boleto/cartão). Simplifica o
   escopo deste lote (um único endpoint de checkout, sem tela de seleção)
   sem fechar a porta pra um seletor futuro — é só mais um campo aceito na
   chamada a `provider.js#createPayment`.
5. **Dois tipos de cobrança apenas: `setup` (`plan.setupPrice`) e
   `monthly` (`plan.monthlyPrice`)** — os dois campos que
   `business/plans.js` já carrega desde a Etapa 10/§52, mas que nada lia
   até este lote (pendência 22 do `docs/CHANGELOG.md`, agora resolvida do
   lado da leitura — cobrar de verdade continua exigindo o flag ligado +
   credenciais reais). Um plano com valor `0`/ausente para o tipo pedido
   nunca gera uma cobrança de R$0 — `NothingToChargeError` antes de tocar
   o Asaas.
6. **Sem enforcement de acesso por status de cobrança** — este lote não
   bloqueia nenhuma funcionalidade do painel/portal com base em uma
   cobrança pendente/vencida (ex. suspender um corretor inadimplente).
   Conectar isso a `business/brokers.js#suspendBroker` ou similar é uma
   decisão de produto explicitamente fora de escopo aqui, mesma postura
   que `modules/plans/eligibility.js` já tomou para publications/feeds.

## Desenho (decisões de implementação dentro do escopo acima)

- **Storage**: `financial/customers/{brokerId}.json` (cliente Asaas do
  corretor, criado uma vez e reaproveitado — o Asaas permite clientes
  duplicados, então isto evita duplicar a cada checkout);
  `financial/charges/{chargeId}.json` (registro flat, mesma lógica de
  `plans/{planId}.json` — sem draft/manifest, uma cobrança não tem
  "publicar"); `indexes/financial/charges/{brokerId}.json` (chargeIds do
  corretor, mesmo padrão de `brokerListingsIndex`, nunca podado);
  `financial/webhook-events/{eventId}.json` (idempotência — ver decisão
  de webhook abaixo). Quatro chaves novas em `storage/keys.js`, um par de
  helpers de índice novo em `storage/indexes.js`
  (`getFinancialChargeIdsForBroker`/`addFinancialChargeToBrokerIndex`).
- **Fonte de verdade do status é local, não o Asaas.** O caminho comum
  (listar/consultar uma cobrança, `payments.js#listChargesForBroker`/
  `getChargeForBroker`) nunca chama o Asaas — lê só o que já está gravado
  em R2, atualizado por `checkout.js` na criação e por `webhook.js` a cada
  evento. `payments.js#syncChargeStatus` (GET `/payments/{id}`) existe só
  como refresh manual best-effort; nenhum caminho automático deste lote a
  chama.
- **Webhook idempotente por `eventId`** (não pelo id do pagamento — um
  mesmo pagamento gera vários eventos ao longo da vida). Um evento cujo
  `id` já foi visto responde `{deduped: true}` sem reprocessar. Um evento
  cujo `payment.externalReference` (o `chargeId` que `checkout.js` grava
  na criação) não bate com nenhuma cobrança local é logado e ignorado
  (`{matched: false}`) com 2xx — nunca faz o Asaas reentregar por um erro
  que não é nosso.
- **Autenticação do webhook**: header `asaas-access-token` comparado a
  `env.ASAAS_WEBHOOK_TOKEN` — secret próprio, nunca `ASAAS_API_KEY` (mesmo
  raciocínio de secrets separados por job de `PASSWORD_PEPPER`/
  `LOGIN_INDEX_SECRET`). Confirmado contra a documentação oficial do Asaas
  nesta sessão (ver pendências) que é exatamente esse o header que o
  Asaas ecoa em toda notificação.
- **`worker/financial.js` (novo)**: três handlers finos —
  `POST /api/me/financial/checkout` (`{kind: "setup"|"monthly"}` →
  cria/retorna a cobrança + `invoiceUrl`), `GET /api/me/financial/charges`
  (lista as próprias cobranças), `GET /api/me/financial/charges/:id`
  (consulta uma, garantindo posse via `charge.brokerId === brokerId` —
  §55, nunca resolvida só pelo id da URL). Todos exigem sessão de corretor
  via `requireTenant`, mesmo padrão de `worker/api.js`.

## Escopo deste lote

- `modules/financial/provider.js`: cliente HTTP do Asaas sandbox
  (`createCustomer`/`createPayment`/`getPayment`) + o kill switch
  (`isFinancialModuleEnabled`/`assertFinancialModuleEnabled`) + as duas
  classes de erro (`FinancialModuleDisabledError`, `AsaasApiError`).
- `modules/financial/checkout.js`: `createCheckoutForBroker` (resolve
  plano → valor → cliente Asaas → cobrança) + `NothingToChargeError`.
- `modules/financial/payments.js`: `listChargesForBroker`/
  `getChargeForBroker`/`syncChargeStatus` + `mapAsaasStatus` (status do
  Asaas → vocabulário interno) + `ChargeNotFoundError`.
- `modules/financial/webhook.js`: `handleAsaasWebhook` (handler HTTP
  público, autenticado por token, idempotente por `eventId`).
- `modules/financial/index.js`: reexporta tudo acima para
  `worker/financial.js`/`worker/index.js`.
- `worker/financial.js` (novo): os três handlers `/api/me/financial/*`.
- `worker/index.js`: quatro rotas novas (as três de `worker/financial.js`
  + `POST /api/webhooks/asaas`, direto de `modules/financial/index.js`).
- `storage/keys.js`: quatro chaves novas (`financialCustomer`,
  `financialCharge`, `financialBrokerChargesIndex`,
  `financialWebhookEvent`).
- `storage/indexes.js`: dois helpers novos (`getFinancialChargeIdsForBroker`/
  `addFinancialChargeToBrokerIndex`).
- `wrangler.toml`: bloco `[vars]` novo (`FINANCIAL_ENABLED = "false"`,
  primeiro uso real do bloco) + dois secrets documentados como pendentes
  (`ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`).
- `business/plans.js`: comentário atualizado (não mais "unbuilt
  placeholder") explicando por que `financial` continua fora de
  `PLAN_MODULE_KEYS` mesmo agora que está implementado.
- `docs/MODULES.md`/`docs/OPERATIONS.md`/`docs/CHANGELOG.md`: atualizados
  para refletir o módulo real (ver esses arquivos).

## Pendências

- **Sem testes neste lote** (pedido explícito do solicitante).
- **Nenhuma credencial/API key sandbox do Asaas existe neste projeto.**
  `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` (ambas `wrangler secret put`,
  ver `wrangler.toml`/`docs/OPERATIONS.md`) estão **PENDENTES de
  provisionamento** — sem isso, mesmo com `FINANCIAL_ENABLED = "true"`,
  `provider.js#apiKey` lança (falha explícita, não um 500 silencioso) e
  `webhook.js` recusa qualquer requisição (`ASAAS_WEBHOOK_TOKEN` ausente →
  503 `"not_configured"`). Nenhuma conta Asaas (nem sandbox) foi criada
  ainda para este projeto, até onde esta sessão sabe — não inventado.
- **Nada neste lote foi exercitado contra a sandbox de verdade**, pela
  razão acima. Endpoints/campos/headers (`https://sandbox.asaas.com/api/v3`,
  header `access_token`, `POST /customers` com
  `name`/`email`/`cpfCnpj`/`externalReference`, `POST /payments` com
  `customer`/`billingType`/`value`/`dueDate`/`description`/
  `externalReference`, header de webhook `asaas-access-token`, payload
  `{id, event, payment: {id, status, externalReference, ...}}`) foram
  confirmados nesta sessão via WebSearch contra `docs.asaas.com` — a rede
  desta sessão não permite bater direto na sandbox. Reconferir contra a
  documentação oficial (e contra uma chamada real, uma vez que
  `ASAAS_API_KEY` exista) antes de ativar em produção.
- **Nenhum webhook foi de fato cadastrado no Asaas** (não há conta/API key
  para isso) — `POST /api/webhooks/asaas` existe e está pronto para
  receber, mas ninguém aponta pra ele ainda. Cadastro é feito pela API do
  Asaas (`POST /v3/webhooks`) ou pelo painel do Asaas, fora do escopo de
  código deste lote.
- **Ativar em produção exige três coisas ao mesmo tempo**, nenhuma
  substituindo a outra: `ASAAS_API_KEY` + `ASAAS_WEBHOOK_TOKEN`
  provisionados, `FINANCIAL_ENABLED = "true"` (commitado em
  `wrangler.toml`, não só no dashboard — ver decisão 1), e um webhook de
  verdade cadastrado no Asaas apontando pra
  `https://imobiliarista.net/api/webhooks/asaas` (ou o que for o domínio
  público do Worker).
- **Sem enforcement de inadimplência** (decisão 6 acima) — nenhuma
  suspensão automática de corretor por cobrança vencida/não paga.
- **Sem frontend/UI no painel do corretor** para a área "financeiro"
  (§54) — este lote é só o backend (`/api/me/financial/*`), sem tela em
  `frontend/painel/`.
- **Sem visão SuperAdmin sobre cobranças** — `worker/admin.js` não ganhou
  rota nenhuma para listar cobranças de todos os corretores; só o próprio
  corretor vê as suas.
- **`syncChargeStatus` não é chamado de lugar nenhum automaticamente** —
  existe só como refresh manual (ex. um futuro botão "atualizar status" no
  painel), não uma reconciliação periódica.
- **CPF do corretor é obrigatório para gerar uma cobrança** — um corretor
  sem `cpf` (hoje só a conta especial TESTE, `allowMissingCpf`) recebe um
  erro de validação explícito ao tentar checkout, em vez de o Asaas
  receber um `cpfCnpj` vazio.
