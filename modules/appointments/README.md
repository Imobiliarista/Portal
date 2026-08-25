# Módulo: appointments

Ver §41 (e §38-§40, §67, §90, §94) de
`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`. §41 é só a árvore
de arquivos do módulo:

```text
modules/appointments/
├── index.js
├── service.js
├── validation.js
├── routes.js
└── README.md
```

Nenhuma linha sobre o fluxo em si — quem entra em contato, onde fica
salvo, como o corretor é avisado, se há aprovação. Diferente de
comparison/financing-calculator (§45/§44, que pelo menos dizem
"client-side, sem Worker"), §41 não dá nenhuma pista de direção. Por
instrução explícita do solicitante para este lote ("se o fluxo de
confirmação não estiver claro, pare e pergunte — não invente"), as
perguntas abaixo foram feitas antes de qualquer código, e as respostas
mudaram a forma do módulo inteiro.

> **Nota sobre uma correção feita durante este lote**: a primeira leitura
> das respostas do solicitante interpretou o módulo como um agendamento
> de verdade — visitante escolhe data/hora, o "envio ao WhatsApp" seria
> só o canal de notificação desse agendamento. Isso estava errado. O
> solicitante corrigiu: **não existe marcação de data/hora nenhuma**. O
> que existe hoje (e este módulo reproduz) é um **formulário de contato
> geral** a partir de um imóvel — nome, telefone, e-mail, mensagem — no
> mesmo padrão do template Houzez (WordPress) usado amplamente no mercado
> imobiliário: um botão/formulário "fale com o corretor" que pré-preenche
> uma mensagem de interesse e abre o WhatsApp do corretor. Nenhuma parte
> deste módulo lida com data/horário de visita. Os campos `preferredDate`/
> `preferredTime` que existiram numa versão anterior deste lote foram
> removidos antes do merge — nunca chegaram a `main`.

## Decisões tomadas (confirmadas com o solicitante antes deste lote)

1. **Não é agendamento com data/horário — é contato geral.** O visitante
   preenche nome, telefone, e-mail (opcional) e uma mensagem — pré-
   preenchida pela UI com "Tenho interesse em {título do imóvel}", mas
   livremente editável/substituível. Não há campo de data nem de
   horário. Prática de mercado atual (addons tipo Houzez), não uma
   decisão inventada por este lote.
2. **Não existe fluxo de aprovação/confirmação dentro da plataforma.** Ao
   enviar o formulário, o navegador do visitante abre
   `https://wa.me/{numero-do-corretor}?text={mensagem}` — o próprio
   visitante confirma o envio no WhatsApp dele. Nenhuma API/integração de
   WhatsApp Business, nenhum backend envolvido. Não há estado
   "pendente"/"confirmado"/"recusado" em lugar nenhum — o corretor recebe
   a mensagem e conduz a conversa (incluindo, se for o caso, combinar uma
   visita) diretamente pelo WhatsApp, fora da plataforma.
3. **Não existe (e não foi adicionada) infraestrutura de e-mail no
   projeto** — confirmado antes de implementar (nem `core/` nem
   `storage/` têm qualquer provedor de e-mail; `modules/saved-search/`, o
   outro módulo desta etapa que mencionaria e-mail, §43, continua
   placeholder). A notificação do corretor é só o redirecionamento para o
   WhatsApp dele — nenhum provedor de e-mail foi adicionado como
   dependência.
4. **Nenhuma persistência em R2 neste momento.** §41 sugeria
   "provavelmente precisa de uma gaveta nova em R2 (privado, associado ao
   corretor dono do anúncio)", mas isso pressupõe o corretor consultando/
   aprovando algo dentro do painel — não é o fluxo real confirmado acima.
   Sem nada para persistir, não há gaveta em R2 PRIVATE, não há índice
   por corretor, não há rota de Worker, e não há tela nova/extensão no
   painel do corretor para "ver contatos recebidos" — o WhatsApp do
   corretor **é** o registro, fora da plataforma. `service.js` e
   `routes.js` (nomes que §41 lista, mas que pressupõem uma camada de
   negócio com I/O e uma rota de Worker) ficam intencionalmente vazios
   neste lote — ver o cabeçalho de cada um.
5. **Número de WhatsApp do corretor: reaproveita `broker.whatsapp`**, já
   existente em `schemas/broker-public.schema.json` (§16) e em
   `business/brokers.js` (allowlist de criação/atualização de perfil)
   desde a Etapa 3 — **nenhum campo novo foi necessário**, confirmado
   antes de codar. Esse campo é texto livre, sem formato validado
   (`business/brokers.js` só valida `maxLength: 40`), então
   `normalizeWhatsAppNumber` reduz a só dígitos e prefixa o código do
   Brasil (`55`) quando ausente (10-11 dígitos = DDD + telefone, sem
   código de país). Um corretor sem WhatsApp válido cadastrado
   simplesmente não recebe contato por este canal — a seção "Fale com o
   corretor" não é renderizada (mesmo espírito de "§49 se inexistente,
   componente não renderiza"), sem fallback para telefone/e-mail neste
   lote.
6. **Referência do imóvel: sempre `listing.slug`** (o mesmo
   `listings/{slug}.json`, §15, que a página de imóvel completo já
   carregou) — nunca um identificador novo, conforme pedido. O formulário
   nem expõe um campo de imóvel: `listingSlug` vem do contexto da página,
   não é digitado pelo visitante; o link do imóvel entra automaticamente
   no fim da mensagem.
7. **Contato do visitante**: `visitorName`, `visitorPhone` e `message`
   são obrigatórios (o canal de notificação é o WhatsApp, então telefone
   é essencial; a mensagem é o conteúdo principal do contato — mesmo
   pré-preenchida, uma mensagem vazia não faz sentido enviar).
   `visitorEmail` é opcional — aparece na mensagem quando preenchido, mas
   não bloqueia o envio.

## Escopo deste lote

- `modules/appointments/validation.js` (novo): `validateAppointmentInput`
  — valida os 5 campos do formulário de contato. Nunca lança —
  `{ valid, errors }`, mesmo padrão de outros módulos desta etapa.
  Exporta também os padrões/helpers internos (`SLUG_PATTERN`,
  `isNonEmptyString`, etc.) só para `index.js#renderFrontendModuleSource`
  poder embuti-los no bundle gerado (mesmo padrão de
  `modules/publications/index.js`).
- `modules/appointments/index.js`: lógica pura, testável em Node —
  `normalizeWhatsAppNumber` (texto livre → dígitos com código de país),
  `buildDefaultAppointmentMessage` (texto de pré-preenchimento —
  "Tenho interesse em {título}", puro e testável para a UI não duplicar a
  string), `buildAppointmentMessage` (monta o texto final: a mensagem do
  visitante primeiro, depois nome/telefone/e-mail/link do imóvel) e
  `buildAppointmentWhatsAppUrl` (ponto de entrada único: valida e, se
  válido e o corretor tiver WhatsApp, monta a URL `wa.me` pronta).
- `modules/appointments/service.js` / `routes.js`: intencionalmente
  vazios — ver decisão 4.
- `scripts/generate-appointments-assets.js` (novo, `npm run
  generate:appointments`, mesmo padrão de
  `scripts/generate-financing-calculator-assets.js`): escreve
  `frontend/shared/appointments.generated.js` — Workers Static Assets só
  publica `frontend/` (`wrangler.toml`), então o módulo não é alcançável
  pelo browser sem esse passo.
- `frontend/portal/components/appointments.js` (novo): a camada de DOM —
  formulário (nome, telefone, e-mail opcional, mensagem — `<textarea>`
  pré-preenchida via `buildDefaultAppointmentMessage`) que, ao ser
  enviado com sucesso, abre `wa.me` numa nova aba
  (`window.open(..., "_blank", "noopener")`). Não renderiza nada se o
  corretor não tiver WhatsApp válido (decisão 5).
- `frontend/portal/data.js`: novo `dataClient.brokerProfile(slug)`
  (`brokers/{slug}/profile.json`) — o portal (ao contrário do minisite,
  que já resolve o corretor pelo hostname) não carrega o perfil do
  corretor por padrão; `listing.broker` (§15) só tem `slug`/`name`, sem
  `whatsapp` (§16), então a página de imóvel completo do portal busca o
  perfil à parte.
- `frontend/portal/app.js` e `frontend/minisite/app.js`: chamam
  `mountAppointmentForm(container, { listing, brokerWhatsapp })` logo após
  `renderListingDetail`/`mountFinancingCalculator` na rota de imóvel
  completo — mesmo padrão "appended after the fact" do módulo
  financing-calculator (evita import circular com `render.js`). No
  minisite, `profile.whatsapp` já está em mãos (buscado antes, para
  resolver a rota); no portal, é buscado com o novo `brokerProfile`.
- `frontend/portal/styles/main.css` e `frontend/minisite/styles/main.css`:
  estilos do formulário — os dois arquivos, mesmo motivo do
  financing-calculator (página de imóvel completo idêntica nos dois
  sites).

Nenhuma mudança em `worker/`, `core/`, `business/`, `storage/` ou em
qualquer schema — `broker.whatsapp` já existia por inteiro (decisão 5).

## Testes cobrindo

O pedido original deste lote incluía "criar agendamento, listar
agendamentos por corretor (isolamento multitenant — corretor A não vê
agendamento de imóvel do corretor B)". Com a decisão 4 (sem
persistência), "listar agendamentos" não existe mais como conceito — não
há nada armazenado para listar. A garantia equivalente que os testes
cobrem:

- **"Criar agendamento" → criar um contato**: `buildAppointmentWhatsAppUrl`
  com um input válido e um corretor com WhatsApp cadastrado produz uma
  URL `wa.me` correta, com a mensagem contendo a mensagem do visitante e
  os dados de contato (`tests/modules/appointments/index.test.js`).
- **Isolamento multitenant, reinterpretado**: como o "registro" agora é
  só a URL do WhatsApp (não um recurso em R2 associado a um `brokerId`),
  a garantia de isolamento é que a URL de contato de um imóvel **sempre**
  resolve para o WhatsApp do corretor daquele imóvel específico — nunca
  para o número de outro corretor processado na mesma sessão do
  navegador. Testado processando dois imóveis de dois corretores
  diferentes na mesma execução e conferindo que cada URL aponta para o
  número correto, sem contaminação cruzada.
- Validação campo a campo (`tests/modules/appointments/validation.test.js`):
  todos os campos obrigatórios (incluindo `message`, agora obrigatório),
  e-mail opcional mas validado quando presente, mensagem com limite de
  tamanho, nunca lança em entrada arbitrária.
- `normalizeWhatsAppNumber` com várias formatações de entrada (com/sem
  DDI, com máscara) e entrada inválida; `buildDefaultAppointmentMessage`
  com o título do imóvel.
- `renderFrontendModuleSource`: o bundle gerado se comporta identicamente
  ao código-fonte (mesmo padrão de comparison/financing-calculator).

A camada de DOM (`frontend/portal/components/appointments.js`, wiring em
`app.js`) segue a mesma convenção de `render.js`/
`components/financing-calculator.js` — verificada visualmente (harness
estático + Playwright), não unit-testada: formulário renderizando com a
mensagem pré-preenchida, URL `wa.me` completa ao enviar, validação de
campo bloqueando o envio, seção ausente para corretor sem WhatsApp —
nenhum erro de console em nenhum caso.

## Pendências

- **Sem histórico de contatos no painel do corretor** — decisão 4 explica
  o porquê (fluxo real confirmado não envolve consulta dentro da
  plataforma). Se isso se provar uma necessidade real de produto (ex. o
  corretor querer um registro além do próprio WhatsApp), a estrutura para
  isso seria: uma rota de Worker recebendo o mesmo `input` já validado
  por `validateAppointmentInput`, uma gaveta em R2 PRIVATE associada ao
  `brokerId` (mesmo padrão de `business/listings.js`), e uma tela/seção
  nova em `frontend/painel/` — nenhuma dessas peças foi adicionada aqui,
  para não implementar um fluxo não confirmado.
- **Corretor sem WhatsApp cadastrado não tem alternativa nesta tela** —
  decisão 5. O `phone` público do corretor (§16) existe no schema mas não
  é usado como fallback aqui; se isso for necessário, é uma decisão de
  produto nova (ex. fallback para `tel:` ou exibir o telefone como
  texto).
- **Mensagem de WhatsApp não é validada quanto a conteúdo malicioso além
  do `encodeURIComponent`** — como nada é persistido nem exibido de volta
  em nenhuma página (o texto só vira parte de uma URL `wa.me` que o
  próprio visitante abre no WhatsApp dele), não há superfície de XSS/
  injeção server-side aqui; ainda assim, `visitorName`/`message` têm
  limite de tamanho (`APPOINTMENT_VISITOR_NAME_MAX_LENGTH`,
  `APPOINTMENT_MESSAGE_MAX_LENGTH`) como sanidade básica.
