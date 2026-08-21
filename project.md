# PROJECT.md — Constituição do Projeto

> Este documento é a fonte única da verdade do projeto **Portal Imobiliário (Multisites)**.
> Toda decisão de arquitetura, escopo, regra de negócio ou convenção de código
> deve estar registrada aqui antes de ser implementada. Nenhum código deve
> contradizer o que está definido neste arquivo. Se algo mudar, este arquivo
> muda primeiro — o código muda depois.

**Status:** 🟢 Todos os 17 lotes do roadmap original implementados, mais os Lotes 18 (recuperação da PR #56 + guardrail) e 19 (smoke tests de integração + CI)
**Última atualização:** Reconectado o gatilho do sitemap dinâmico (Lote 11, seção 4.16) — `jobs/revalidacao-cruzada.ts` agora enfileira `gerar-sitemap-portal`/`gerar-sitemap-corretor` junto com o resto do lote (nunca era enfileirado por nenhum ponto do código); corrigido também um `D1_TYPE_ERROR` real em `gerar-sitemap.ts` (query de anúncios sem `cidade_id`) que só apareceu testando o job com dado de verdade; ver Histórico de Decisões
**Versão:** 1.21

---

## 1. Visão Geral

- **Nome do projeto:** Portal Imobiliário (Multisites)
- **Domínio principal:** imobiliarista.net
- **O que é:** Rede de portais imobiliários com um portal central de busca, minisites individuais para cada corretor, e compartilhamento de listas de anúncios entre domínios diferentes.
- **Para quem é:** Corretores/imobiliaristas autônomos (fase 1) e visitantes buscando imóveis.
- **Problema que resolve:** Unifica anúncios de múltiplos corretores em uma rede compartilhada e reutilizável entre domínios, com sites individuais no estilo WordPress Multisite — mas em arquitetura serverless de custo quase zero.
- **Diferenciais:**
  1. Compartilhamento/"empréstimo" de listas de anúncios entre domínios diferentes via JSON exportado para o R2 (ex: um segundo portal como `londrinense.net` pode consumir os anúncios de Londrina do `imobiliarista.net`).
  2. Arquitetura 100% Cloudflare (Workers + D1 + R2) otimizada para operar dentro (ou perto) do free tier.
  3. PWA leve, tanto para o portal quanto para os minisites dos corretores (por plano, ver 4.18).
  4. Fila de alterações em lote no painel, minimizando requisições ao banco.

---

## 2. Escopo

### 2.1 Dentro do escopo (fase 1)

- Portal público com filtro de cidade: Home → `/cidade` (ex: `/londrina`) → filtros avançados (tipo de negócio, tipo de imóvel) → `/cidade/negocio/tipo` → listagem de anúncios (cards horizontais/verticais, mapa) → página do anúncio individual (com dados do corretor e seus outros anúncios).
- Minisites de corretores: `nome.imobiliarista.net`, mesmo template para todos, exibindo somente os anúncios daquele corretor. **Padrão único, sem suporte a múltiplos corretores por site (sem "imobiliária").**
- Dois painéis administrativos:
  * **Superadmin:** gestão de toda a rede, dos minisites e dos **Planos** (ver 6.3).
  * **Dono do site (corretor):** configurações de conta, site e anúncios.
- Anúncios funcionam como "posts" (CRUD completo: incluir, editar, excluir), com toggle **"postar na rede"** (ligado por padrão a cada cadastro; se desligado, o anúncio some da rede e fica visível só no minisite do corretor).
- **Campos personalizados/comodidades** por anúncio (piscina, mobiliado, churrasqueira, etc.).
- **Busca salva / alerta de novos imóveis por e-mail** (visitante salva critérios de busca e recebe aviso quando surgir anúncio compatível).
- **Agendamento de visita ao imóvel** (visitante solicita horário; corretor confirma).
- **Comparação entre anúncios** (visitante compara 2-3 imóveis lado a lado).
- **Calculadora de financiamento** (widget no anúncio).
- **Mapas via OpenStreetMap + Leaflet.js** (gratuito, sem chave de API) como padrão para todos; Google Maps API disponível como opção premium (corretor usa sua própria chave, via campo no Plano).
- **Geolocalização do visitante** (`navigator.geolocation`, nativa do navegador) para sugerir a cidade mais próxima na home.
- **Sistema de Planos** (necessidade técnica de custo **e** modelo comercial — ver 5.1, 6.3, 6.4):
  * Número máximo de anúncios permitidos.
  * Número máximo de fotos por anúncio (e resolução máxima de upload).
  * Campo para o corretor inserir sua própria chave de API do Google Maps (opcional).
  * Taxa de adesão única + mensalidade recorrente por plano.
  * Acesso a PWA e a Publicações condicionado ao plano contratado.
  * Módulo de integração com **Asaas**: infraestrutura implementada (`src/services/asaas.ts`, `src/routes/webhooks/asaas.ts`), **desativada por padrão** via `ASAAS_ATIVO=false` — sem nenhum vínculo com o fluxo real de troca de plano ainda (ver 3 e Histórico de Decisões).
- Botão **"Fale com o corretor"** via WhatsApp em cada anúncio (substitui chat interno).
- **PWA** (Progressive Web App), módulo opcional por plano — ver 4.18.
- **Publicações** (feed de blog do corretor ou feed padrão da rede), módulo opcional por plano — ver 4.19.
- **Fila de alterações em lote** no painel do corretor (ver seção 4.4).
- Compartilhamento de listas JSON de anúncios entre domínios diferentes (via R2).
- **Feed XML (formato VRSync) por corretor**, para integração com ZAP/OLX/VivaReal/Chaves na Mão (ver seção 4.11).

### 2.2 Fora do escopo (fase 1)

- Chat interno entre corretor e visitante (substituído por link direto de WhatsApp por anúncio).
- App mobile nativo (substituído por PWA).
- **Cobrança ativa via Asaas** (módulo de infraestrutura implementado e desativado por padrão — ver seção 3 e Histórico de Decisões; cobrança real continua fora do escopo da fase 1).
- **Captura de leads via formulário + gestão de contatos (CRM-lite)** — adiado para fase futura por gerar processamento/armazenamento adicional.
- **Insights/Analytics de desempenho** (visualizações por anúncio, engajamento) — mesmo motivo acima.
- **Descartado definitivamente** (não só "fora da fase 1"): Sistema de imobiliárias (empresas com vários corretores agrupados) — plataforma é só para corretores individuais, decisão permanente.

### 2.3 Fases futuras (roadmap)

| Fase | Entregável                                                                    | Status            |
| ---- | ----------------------------------------------------------------------------- | ----------------- |
| 1    | Portal + minisites + painéis + rede de anúncios + PWA + Publicações           | 🟢 Fundação em produção — expansão em planejamento |
| 2    | Captura de leads + gestão de contatos + insights de desempenho (CRM completo) | 🔲 Não iniciado    |
| 3    | Cobrança ativa via Asaas                                                      | 🟡 Módulo implementado, desativado (`ASAAS_ATIVO=false`) — aguardando credenciais de produção e decisão de ativação |
| 4    | Sistema de imobiliárias (multi-corretor)                                      | 🔲 Não iniciado    |

---

## 3. Stack Técnica

| Camada                     | Tecnologia                                                                                                                                                                    | Observação                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Frontend                   | HTML + JS simples + **Tailwind CSS** (sem Bootstrap ou outro framework CSS junto — evita conflito de resets/especificidade e peso duplicado)                                  | Filtros e listagem processados no navegador a partir do JSON recebido                                                           |
| PWA                        | Manifest + Service Worker                                                                                                                                                     | Portal (sempre) e minisites (condicionado ao plano — ver 4.18)                                                                  |
| Hospedagem/Infra           | Cloudflare Workers                                                                                                                                                            | Conectado ao repositório GitHub                                                                                                 |
| Banco de dados             | Cloudflare D1                                                                                                                                                                 | Uso restrito: escrita + leitura administrativa (painéis). Nunca lido diretamente pelo visitante público                         |
| Armazenamento/distribuição | Cloudflare R2                                                                                                                                                                 | JSONs por cidade + imagens dos anúncios. Exposto via subdomínio público próprio, contornando o Worker nas leituras do visitante |
| Cache                      | Cloudflare Edge Cache                                                                                                                                                         | Cache-Control agressivo nos JSONs; regra "Cache Everything"                                                                     |
| Fila/lote                  | **Cloudflare Queues** (não Durable Objects) — `max_batch_size` + `max_batch_timeout` já fazem nativamente a agregação de mensagens de múltiplos corretores no mesmo intervalo | 10.000 operações/dia grátis no plano Workers Free                                                                               |
| Mapas                      | **OpenStreetMap + Leaflet.js** (padrão, gratuito, sem chave de API) · Google Maps API (opcional/premium, chave do próprio corretor)                                           |                                                                                                                                 |
| Geolocalização             | `navigator.geolocation` (nativa do navegador)                                                                                                                                 | Sugerir cidade mais próxima na home                                                                                             |
| Cobrança (futuro)          | Asaas — módulo de infraestrutura implementado (`src/services/asaas.ts`, `src/routes/webhooks/asaas.ts`), desativado por padrão via `ASAAS_ATIVO=false`; sem cobrança real disparada nesta fase | Ver Histórico de Decisões (achado de auditoria de 2026-08-19 + implementação subsequente) |
| Domínio                    | imobiliarista.net                                                                                                                                                             | Wildcard `*.imobiliarista.net` para minisites                                                                                   |
| Repositório                | github.com/Imobiliarista/Portal                                                                                                                                               |                                                                                                                                 |

### 3.1 Limites do plano Free da Cloudflare (referência, verificar periodicamente)

| Serviço | Limite gratuito                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------ |
| Workers | 100.000 requisições/dia · 10ms CPU/invocação · 128 MB memória · 50 subrequisições/requisição     |
| D1      | 5 GB armazenamento · 5.000.000 linhas lidas/dia · 100.000 linhas escritas/dia                    |
| R2      | 10 GB armazenamento · 1.000.000 gravações/mês · 10.000.000 leituras/mês · **zero egress sempre** |

---

## 4. Arquitetura

### 4.1 Roteamento — DECISÃO FECHADA

- Implementação: **Worker puro** (não Cloudflare Pages/Pages Functions) — Pages não suporta subdomínio wildcard dinâmico de forma nativa e confiável (limitação confirmada na documentação/comunidade oficial da Cloudflare em 2026).
- DNS: registro wildcard `*.imobiliarista.net` **obrigatoriamente com proxy ativado (nuvem laranja)**. DNS-only (nuvem cinza) impede o Worker de interceptar qualquer requisição.
- Rota do Worker (padrão oficial "hostname routing" da Cloudflare para SaaS multi-tenant por subdomínio):

```
[[routes]]
pattern = "*.imobiliarista.net/*"
zone_name = "imobiliarista.net"
```

- Dentro do código, o Worker lê `request.headers.get("host")` para decidir: domínio raiz → Portal público; subdomínio → minisite do corretor correspondente.
- O GitHub continua sendo apenas o repositório de código/versionamento — o Worker é implantado automaticamente a partir dele (Workers Builds), mas quem serve as requisições ao vivo é sempre o Worker rodando no Edge da Cloudflare, nunca o GitHub diretamente.
- **Nosso Worker não é "burro"** — ele já faz roteamento por hostname e reconhece padrões de rota específicos (ex: slug+ID de anúncio, seção 4.14; rota de post individual de Publicações, seção 4.19). Diferente de arquiteturas com Worker puramente estático, path routing customizado é uma opção real aqui, não uma limitação.

### 4.2 Estrutura de pastas — DECISÃO FECHADA

```
/
├── project.md                   # constituição do projeto (raiz do repo)
├── README.md                    # como rodar o projeto localmente, comandos básicos
├── .gitignore                   # ignora node_modules, .env, dist, etc.
├── .env.example                 # modelo de variáveis de ambiente (sem valores reais)
├── wrangler.toml                # bindings (D1/R2), rotas, config do Worker
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
│
├── .github/
│   └── workflows/
│       └── ci.yml                 # (opcional) lint/testes antes de aceitar PR
│
├── src/                          # código do Worker (backend)
│   ├── index.ts                    # entry point — roteador principal (fetch handler)
│   ├── queue.ts                    # consumer da imob-queue (processa o lote, 4.4)
│   ├── queue-dlq.ts                # consumer da imob-queue-dlq — log + alerta por e-mail (Lote 23)
│   ├── scheduled.ts                # Cron Triggers (export D1 mensal, geração periódica)
│   │
│   ├── middleware/
│   │   ├── www-redirect.ts           # remoção do "www" (4.5)
│   │   └── bot-detect.ts             # dynamic rendering pra bots (4.6)
│   │
│   ├── routes/                     # núcleo obrigatório (não modularizado — sempre ativo)
│   │   ├── portal.ts                 # rotas do portal público
│   │   ├── minisite.ts               # rotas dos minisites
│   │   ├── painel-corretor.ts        # API do painel do corretor — /api/painel-corretor/* (shell estático em public/painel/, ver 4.9)
│   │   ├── painel-superadmin.ts      # API do painel do superadmin (aprovações, cidades, módulos, planos) — /api/painel-admin/* (shell estático em public/painel-admin/, ver 4.9)
│   │   ├── api-auth.ts               # login, pré-cadastro, recuperação de senha
│   │   ├── api-anuncios.ts           # CRUD de anúncios
│   │   └── sitemap.ts                # sitemap.xml / robots.txt (4.16)
│   │
│   ├── modulos/                    # funcionalidades ativáveis/desativáveis via painel — DECISÃO FECHADA (ver 4.2.1)
│   │   ├── busca-ia/                 # rota.ts + logica.ts — assistente de busca IA (4.12)
│   │   ├── feed-grupo-olx/           # rota.ts + gerador.ts — XML VRSync (4.11)
│   │   ├── feed-portais-independentes/
│   │   ├── video-youtube/            # embed limpo (5.1.2)
│   │   ├── tour-360/
│   │   ├── busca-salva-email/
│   │   ├── agendamento-visita/
│   │   ├── comparacao-anuncios/
│   │   ├── calculadora-financiamento/
│   │   ├── pwa/                      # rota.ts + gerador-manifest.ts + gerador-service-worker.ts (4.18)
│   │   └── publicacoes/              # rota.ts + logica.ts (4.19)
│   │
│   ├── db/
│   │   ├── queries-anuncios.ts
│   │   ├── queries-corretores.ts
│   │   ├── queries-cidades.ts
│   │   ├── queries-cotas-portal.ts   # CotaPortal (4.11)
│   │   ├── queries-modulos.ts        # flags ativo/inativo (4.2.1)
│   │   └── queries-planos.ts         # CRUD de Planos pelo Superadmin (6.3)
│   │
│   ├── jobs/                       # um arquivo por tipo de artefato gerado em lote
│   │   ├── gerar-json-cidade.ts      # 4.4, com particionamento automático (4.4.2)
│   │   ├── gerar-json-corretor.ts    # 4.4.1
│   │   ├── gerar-html-snapshot.ts    # HTML pra bots (4.6)
│   │   ├── gerar-sitemap.ts          # 4.16
│   │   └── revalidacao-cruzada.ts    # dispara cidade+corretor juntos (4.4.1.1)
│   │
│   ├── lib/
│   │   ├── r2.ts
│   │   ├── asaas.ts
│   │   ├── ibge.ts                   # catálogo de cidades (5.4)
│   │   ├── sanitize.ts               # normalização de strings (4.15)
│   │   ├── slug.ts                   # slug + ID da URL (4.14)
│   │   ├── cpf.ts                    # validação de dígito verificador
│   │   ├── senha.ts                  # hash PBKDF2 + salt (6.2)
│   │   └── vrsync-mapper.ts          # tabela de-para de taxonomia (4.11)
│   │
│   └── types/
│       ├── env.d.ts
│       └── modelos.ts                # Anuncio, Corretor, Plano, CotaPortal...
│
├── public/                       # Static Assets (4.6)
│   ├── index.html
│   ├── painel/index.html             # shell do painel do corretor
│   ├── painel-admin/index.html       # shell do painel do superadmin
│   ├── manifest.json
│   ├── sw.js
│   ├── icons/
│   └── assets/
│       ├── css/tailwind.css
│       └── js/
│           ├── app.js
│           ├── painel.js
│           ├── filtros.js            # busca avançada (9.2.1)
│           ├── mapa.js               # Leaflet/OSM + Google Maps opcional
│           └── cache-buster.js       # invalidação via timestamp (4.6.1)
│
├── styles/
│   └── input.css
│
├── migrations/
│   ├── 0001_init.sql
│   ├── 0002_taxonomia.sql
│   ├── 0003_cidades_ibge.sql        # seed do catálogo IBGE (5.4)
│   ├── 0004_modulos.sql             # tabela modulos_ativos (4.2.1)
│   └── 0005_planos.sql              # tabela planos + seed dos 5 planos de referência (5.1.3)
│
└── tests/
```

### 4.2.1 Sistema de módulos ativáveis/desativáveis — DECISÃO FECHADA

Inspirado no modelo de plugins do WordPress, mas adaptado à realidade técnica do Cloudflare Workers (código compilado num único bundle no deploy — não existe "soltar arquivo novo e o sistema reconhece sozinho", diferente do PHP tradicional). Resolve as duas necessidades por caminhos diferentes:

- **Organização em módulos autocontidos** (`src/modulos/`): cada funcionalidade opcional (busca por IA, feeds externos, vídeo, tour 360°, busca salva, agendamento, comparação, calculadora, PWA, Publicações) fica isolada em sua própria pasta — fácil de localizar, editar ou remover sem mexer no restante do sistema.
- **Flags ativo/inativo no D1** (tabela `modulos_ativos`): painel do Superadmin com switch por módulo, igual à tela de "Plugins" do WordPress. Cada rota/job de um módulo checa a flag antes de executar — desligar um módulo tem **efeito imediato, sem redeploy**.
- **Alguns módulos têm controle duplo**: além da flag de rede, dependem também de um campo no **Plano** do corretor (ex: PWA e Publicações — ver 4.18, 4.19, 6.3). Um módulo só fica disponível pro corretor se **ambas** as condições forem verdadeiras.
- **Limite honesto:** adicionar um módulo **novo** (que ainda não existe no código) sempre exige escrever o código e fazer um novo deploy — isso não é simulável no Workers como é no WordPress. O sistema de flags controla **ligar/desligar módulos já existentes**, não criar módulos do nada em tempo real.
- Núcleo obrigatório (`routes/` — portal, minisite, painéis, autenticação, CRUD de anúncios) fica **fora** de `modulos/`, pois não são funcionalidades opcionais.

**Limite de tamanho por arquivo: ~500 linhas.** Arquivo se aproximando desse limite é sinal de que está fazendo coisa demais — deve ser quebrado em módulos menores (ver 7. Convenções de Código).

### 4.3 Bindings (wrangler.toml) — DECISÃO FECHADA

```
[[d1_databases]]
binding = "DB"
database_name = "imob-bd"
database_id = "46c7f8d4-ef47-47f4-8c62-ebe63516f6a6"

[[r2_buckets]]
binding = "DADOS_CACHE"
bucket_name = "imob-dados"

[[r2_buckets]]
binding = "MIDIAS"
bucket_name = "imob-midias"

[[r2_buckets]]
binding = "BACKUP_PRIVADO"
bucket_name = "imob-backup-privado"

[[routes]]
pattern = "imobiliarista.net/*"
zone_name = "imobiliarista.net"

[[routes]]
pattern = "*.imobiliarista.net/*"
zone_name = "imobiliarista.net"
```

Acesso a D1 e R2 sempre via **binding direto** (não API REST/S3 SDK externo) — mais rápido, mais barato, sem tokens expostos.

R2 em três buckets separados: `DADOS_CACHE` (`imob-dados`) para os JSONs de cidade/corretor e XMLs de feed; `MIDIAS` (`imob-midias`) para as fotos dos anúncios; `BACKUP_PRIVADO` (`imob-backup-privado`) **exclusivamente** para o export mensal do D1 (backup, seção 4.13). Os dois primeiros têm Custom Domain público por desenho (ver 4.4) — `https://dados.imobiliarista.net` e `https://midias.imobiliarista.net` — consumido pelo front-end via as constantes `R2_DADOS_URL`/`R2_MIDIAS_URL` em `public/assets/js/app.js`. **`BACKUP_PRIVADO` nunca deve ter Custom Domain nem r2.dev habilitado** — contém `senha_hash`, CPF e tokens de sessão; ver incidente de segurança registrado no Histórico de Decisões (2026-08-19) e a checagem automatizada em `scripts/ci/verificar-bucket-backup-privado.js`.

**Importante:** são duas rotas, não uma. `*.imobiliarista.net/*` cobre os subdomínios, mas **não cobre o domínio raiz puro** — por isso a rota `imobiliarista.net/*` precisa existir separadamente, senão o domínio raiz nem passa pelo Worker.

### 4.4 Fluxo de dados (leitura pública — visitante) — DECISÃO FECHADA

1. D1 é a fonte da verdade.
2. Alterações no painel são acumuladas localmente (não disparam requisição individual).
3. Ao clicar "Enviar alterações em massa": o pacote entra numa fila; o sistema agrega pacotes de outros clientes que enviarem na mesma janela.
4. Uma única requisição em lote é feita ao D1 (todas as mudanças de todos os clientes).
5. A regeneração dos arquivos estáticos (ver 4.4.1) **não roda dentro da mesma requisição do INSERT/UPDATE** (evita estourar o limite de CPU por invocação do Worker no plano free). Roda **depois**, de forma assíncrona, via `ctx.waitUntil()` ou, preferencialmente, uma **Cloudflare Queue** processando o lote fechado.
5.1. **Granularidade da Queue — DECISÃO FECHADA:** a fila processa **uma mensagem por arquivo a ser gerado** (ex: uma mensagem só pro JSON da cidade X, outra só pro JSON do corretor Y, outra só pro XML do Grupo OLX do corretor Y, outra pro XML de cada portal independente ativado) — **nunca uma mensagem única que gera todos os arquivos de um corretor de uma vez**. Isso evita que uma única invocação do Worker acumule trabalho de CPU suficiente pra estourar o limite de 10ms por invocação do plano free, conforme a quantidade de portais/formatos gerados por corretor crescer (JSON cidade + JSON corretor + XML Grupo OLX + XML de N portais independentes).
6. Arquivos regenerados **somente quando há mudança de dado**, nunca por requisição de leitura.
7. Visitante escolhe uma cidade → recebe o JSON daquela cidade **direto do R2** (bypass do Worker) → filtra e navega tudo em cache no navegador, sem tocar D1.
8. Domínios externos parceiros podem consumir os mesmos JSONs do R2 para "emprestar" listas de anúncios.

#### 4.4.1 JSON duplo: por Cidade + por Corretor — DECISÃO FECHADA

Um corretor não fica limitado a uma única cidade (ex: Marcos mora em Londrina, mas vende também em Cambé, Ibiporã e Maringá). Por isso, a rotina de compilação em lote gera **dois conjuntos de arquivos independentes** no R2:

| Arquivo                   | Conteúdo                                                                                                    | Quem consome                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/cidades/{cidade}.json`  | Todos os imóveis ativos daquela cidade com "postar na rede" **LIGADO**                                      | Portal Principal (`imobiliarista.net/{cidade}`) e domínios parceiros que "emprestam" a lista |
| `/corretores/{slug}.json` | **Todos** os imóveis do corretor, de qualquer cidade, incluindo os que estão com "postar na rede" desligado | Exclusivamente o Minisite do corretor (`{slug}.imobiliarista.net`)                           |

- Se o corretor cadastra um imóvel com "postar na rede" desligado: entra no `{slug}.json` (aparece no minisite dele), mas **não** entra no `{cidade}.json` (não aparece no portal público) — isolamento de visibilidade total.
- Se o minisite do corretor tiver filtro de cidades, o JS lê o próprio `{slug}.json` e monta o seletor só com as cidades onde ele realmente tem imóveis.

#### 4.4.1.1 Revalidação cruzada de eventos — DECISÃO FECHADA

Qualquer alteração de anúncio que envolva o toggle "postar na rede" (LIGADO→DESLIGADO ou DESLIGADO→LIGADO) ou exclusão/desativação do anúncio **dispara obrigatoriamente duas mensagens na Queue**, nunca uma só:

1. Recompilar `/corretores/{slug}.json`
2. Recompilar `/cidades/{cidade}.json`

Sem essa regra, um anúncio desligado da rede continuaria "fantasma" no `{cidade}.json` até a próxima regeneração daquele arquivo por outro motivo — inconsistência visível pro visitante do portal.

#### 4.4.2 Particionamento automático do JSON de cidade (escala) — DECISÃO FECHADA

Cálculo de referência que motivou essa decisão: numa mega-cidade (ex: 2.000 corretores × 300 anúncios × 20 fotos = 600.000 anúncios), um único arquivo de cidade sem partição chegaria a **~174 MB brutos / ~35 MB comprimidos** — inviável de entregar ao navegador do visitante numa resposta só. Em cidades médias (~100-300 anúncios), um arquivo único já fica na casa de dezenas de KB — sem necessidade de particionar.

**Regra de decisão — corte por tamanho, não por contagem:** no processo em lote, após gerar o JSON de uma fatia, o sistema mede o **tamanho comprimido resultante**. Se ultrapassar um teto de referência (**~1 MB comprimido**), desce mais um nível de partição automaticamente; se não ultrapassar, para ali. Contagem de anúncios sozinha não é critério confiável (depende de quantos campos/fotos por anúncio).

**Ordem de partição (sempre nessa sequência, um nível de cada vez):**

```
Cidade inteira
  → Tipo de Negócio (Venda/Locação), se necessário
    → Categoria (Residencial/Comercial/etc.), se necessário
      → Tipo de Imóvel, se necessário
        → Região/Bairro (campo já identificado em 5.1.1), se necessário
          → Paginação (rede de segurança final), se ainda necessário
```

Exemplos de caminho de arquivo conforme o nível ativado: `/cidades/londrina.json` (sem partição) → `/cidades/londrina/venda.json` → `/cidades/londrina/venda/residencial.json` → `/cidades/londrina/venda/residencial/apartamento.json` → `/cidades/londrina/venda/residencial/apartamento/zona-sul.json` → `.../zona-sul-p1.json`, `-p2.json`...

**Arquivo-índice por cidade:** antes de baixar qualquer lista, o navegador busca primeiro um índice leve (`/cidades/{cidade}/_index.json`, poucos KB) que informa em quantos arquivos aquela cidade está dividida (se estiver) e os caminhos de cada um — o front-end nunca precisa "adivinhar" a estrutura.

**Foto de capa apenas na listagem:** em todo JSON de listagem (cidade e corretor), cada anúncio carrega **só 1 foto de capa** (não a galeria completa) — a galeria completa (todas as fotos) só é buscada quando o visitante abre o anúncio individual. Regra única, aplicada sempre (não só em cidades grandes), para manter comportamento consistente.

**Reavaliação automática:** o particionamento é recalculado a cada execução do lote — sem intervenção manual, sem necessidade de configuração por cidade. Na prática, a esmagadora maioria das cidades permanece com um único arquivo por anos; só mega-cidades eventualmente acionam os níveis adicionais.

### 4.5 Regra de remoção de "www" — DECISÃO FECHADA

Qualquer requisição cujo hostname comece com `www.` — seja no domínio raiz (`www.imobiliarista.net`) ou em qualquer subdomínio (`www.marcos.imobiliarista.net`) — é redirecionada (HTTP 301) para a versão sem `www.`, antes de qualquer outro processamento. Essa checagem é a primeira coisa que o Worker faz em `fetch()`.

```javascript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.replace("www.", "");
      return Response.redirect(url.toString(), 301);
    }

    // ... restante da aplicação (roteamento por hostname, D1, R2, etc.)
  }
};
```

Pré-requisito: DNS em nuvem laranja (proxied) — sem isso a requisição nunca chega ao Worker (ver seção 4.1).

### 4.6 Estratégia de minimização de requisições ao Worker — DECISÃO FECHADA

Objetivo: manter o consumo de Workers o mais próximo possível de zero, mesmo em escala, preservando SEO.

| Tipo de tráfego                                               | Como é servido                                                                                                                               | Toca o Worker?                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Visitante humano (portal ou minisite)                         | **Workers Static Assets** (`[assets]` no wrangler.toml, modo SPA fallback) — HTML/JS/CSS servidos de graça e ilimitado, sem invocar o script | ❌ Não                                |
| Robô de busca / preview (Googlebot, WhatsApp, Facebook, etc.) | Worker detecta via `User-Agent` e serve um **HTML pré-renderizado** (gerado no lote, salvo no R2) — técnica de *dynamic rendering*           | ✅ Sim, mas volume baixíssimo         |
| Dados de listagem (filtros, cards)                            | JS no navegador lê `location.hostname`/`location.pathname` e busca o **JSON direto do R2** (bypass do Worker)                                | ❌ Não                                |
| Painel do corretor/superadmin                                 | Ações autenticadas de escrita → **Worker + D1**                                                                                              | ✅ Sim (esperado)                     |
| Geração de JSON + HTML por cidade                             | Processado em lote (fila/Queue), nunca por requisição individual                                                                             | ✅ Sim, mas em lote, não por visita   |
| Visitas repetidas do mesmo dispositivo                        | **Cache local via Service Worker da PWA** — Static Assets recentes servidos direto do dispositivo, sem sair para a rede (JSONs de anúncio NUNCA cacheados — ver 4.18)              | ❌ Não (nem R2, nem Worker, nem rede) |

Resultado esperado: a esmagadora maioria do tráfego de visitante nunca invoca o Worker; a cota de 100 mil requisições/dia do plano free fica reservada quase inteiramente para o painel administrativo e a geração de dados em lote.

#### 4.6.1 Buster de cache — versionamento leve pra invalidar o cache local da casca institucional — DECISÃO FECHADA (revisada em 4.18)

**Problema que resolve:** cache agressivo (edge + Service Worker da PWA) da casca institucional (HTML/CSS/JS do shell) significa que, sem mecanismo de invalidação, o visitante que já carregou o site poderia continuar vendo uma versão desatualizada do shell por muito tempo.

**Solução:** cada arquivo-índice de cidade (`/cidades/{cidade}/_index.json`, já definido em 4.4.2) carrega um campo leve `"last_updated": <timestamp>`, usado como parte do nome do cache do Service Worker (`institucional-{VERSAO_ATIVA}`) — trocar a versão invalida o cache antigo automaticamente.

> **Escopo restrito pela revisão de 4.18:** este mecanismo de buster de cache aplica-se apenas à **casca institucional** (shell HTML/CSS/JS, manifest, páginas utilitárias). Os **JSONs de anúncio** (cidade/corretor) **não são mais cacheados pelo Service Worker em nenhuma hipótese** — são sempre buscados da rede (network-only, ver 4.18). Isso elimina o risco de anúncio desatualizado servido do cache, ao custo de exigir conexão para ver dados de anúncio atualizados — trade-off aceito.

### 4.7 Compactação de fotos — DECISÃO FECHADA

- **Formato:** WebP (qualidade ~75-80%). Escolhido por ter suporte nativo e estável de codificação no navegador (via `Canvas`/`OffscreenCanvas`), diferente do AVIF, que comprime mais mas tem codificação client-side inconsistente entre dispositivos.
- **Onde ocorre a compressão:** inteiramente no **navegador do corretor**, antes do upload — nunca no Worker. Processar imagem no Worker arrisca estourar o limite de 10ms de CPU por invocação do plano free, e o produto oficial da Cloudflare para isso (Cloudflare Images) é pago, sem tier gratuito.
- **Resoluções geradas por foto (client-side, antes do envio):**
  * **Thumbnail** (~400px de largura) → usada nos cards de listagem.
  * **Full-size** (~1600px de largura) → usada na página do anúncio.
- **Fluxo:** foto já comprimida e nas duas resoluções → enviada ao Worker dentro do lote de alterações → gravada no R2 via binding.
- **Reforço no sistema de Planos:** além do nº máximo de fotos por anúncio, o Plano também deve limitar a **resolução/tamanho máximo aceito por upload**, protegendo o limite de 10 GB grátis do R2.

### 4.8 Compressão de entrega dos JSONs — DECISÃO FECHADA

- **Não há compressão manual** (gzip/brotli) feita no código, nem no momento de gerar o JSON, nem no upload ao R2. Tentar pré-comprimir manualmente traz complicações conhecidas (double-compression, cliente recebendo binário cru) sem necessidade.
- **Compressão automática pela Cloudflare (Brotli):** qualquer resposta servida através da rede da Cloudflare em nuvem laranja (Worker ou R2 via domínio público) é automaticamente comprimida com Brotli na borda, conforme o `Accept-Encoding` do navegador do visitante — tipicamente reduz 70-90% do tamanho de um JSON. Não exige nenhum código.
- **Pré-requisitos a garantir (configuração, não código):**
  1. "Content Compression" ativado no painel Cloudflare (Speed → Optimization) — normalmente já vem ligado por padrão.
  2. Nunca enviar o header `Cache-Control: no-transform` nas respostas — ele desativa a compressão automática.
- **Otimização na geração do JSON:** serializar sem indentação/espaços (`JSON.stringify(dados)` compacto, sem pretty-print) — reduz o tamanho bruto antes mesmo da compressão de borda atuar.

### 4.9 Melhorias adicionais de economia — DECISÃO FECHADA

- **`db.batch()` do D1:** ao gravar várias linhas de uma vez (ex: lote de anúncios), usar o método nativo `db.batch([...])` do D1 — envia várias instruções SQL numa única viagem de rede, em vez de chamadas separadas. Reduz overhead e CPU gasto no Worker.
- **Índices no D1:** criar índice nas colunas mais usadas em filtros (`cidade`, `corretor_id`, `publicado`) para acelerar a consulta que gera o JSON da cidade, evitando estourar o limite de CPU por invocação conforme a base cresce.
- **Nunca armazenar a foto original no R2:** só as versões já comprimidas (thumbnail + full-size, WebP, ver 4.7) sobem ao R2. O arquivo cru do celular do corretor nunca é enviado nem guardado.
- **Painel do corretor/superadmin também como Static Asset:** o HTML/CSS/JS da interface do painel (`public/painel/index.html`, `public/painel-admin/index.html`) é servido como Static Asset (grátis, sem invocar o Worker). As chamadas de API que efetivamente leem/gravam dado vivem em prefixo **deliberadamente separado** do shell — `/api/painel-corretor/*` (corretor) e `/api/painel-admin/*` (superadmin) — para que o roteador de API nunca intercepte a própria página HTML do painel. Ver Histórico de Decisões (seção 11) para o bug real que essa separação corrige.
- **Alertas de uso no painel da Cloudflare:** configurar avisos quando o consumo de D1/R2/Workers se aproximar do limite do plano free, permitindo decidir proativamente sobre upgrade em vez de ser surpreendido por erro 429.

### 4.10 Postura sobre upgrade para o plano pago — DECISÃO FECHADA

- O plano pago do Workers ($5/mês) é aceitável como **rede de segurança**, não como ponto de partida. Remove o teto de 100 mil requisições/dia e inclui cota generosa de CPU; o D1 pago também é barato por operação.
- Estratégia: permanecer no free tier o máximo possível através das otimizações já registradas (4.6 a 4.9); o upgrade pago é ativado apenas quando o volume real justificar (via os alertas de uso), não desde o dia 1.

#### 4.10.1 Estimativa de gatilho — R2 é o limite que esgota primeiro, não o D1 — DECISÃO FECHADA (referência de planejamento)

**Premissa de distribuição de clientes por Plano (estimativa do negócio):** ~90% dos corretores no Plano 1, ~10% no Plano 2 (ver 5.1.3). Planos 3-5 tratados como exceção, não como base do cálculo.

**Cálculo de referência (pior caso — corretor no teto máximo do próprio plano):**

| Plano | Limite | Storage máx./corretor (foto processada ≈180KB/par thumb+full) |
|---|---|---|
| Plano 1 | 100 anúncios × 10 fotos | ≈ 176 MB |
| Plano 2 | 200 anúncios × 15 fotos | ≈ 527 MB |

Média ponderada pela distribuição estimada: `(0,9 × 176MB) + (0,1 × 527MB) ≈ 211 MB por corretor`.

**Gatilho estimado:** `10.240 MB (free tier R2) ÷ 211 MB ≈ 48 corretores` no teto máximo do próprio plano esgotam o storage grátis do R2. Na prática, esse número tende a ser maior, já que a maioria dos corretores não usa 100% do limite de fotos desde o início.

**Por que o R2 esgota antes do D1:** o D1 armazena só texto/linhas relacionais (leve); o R2 armazena as fotos processadas, que pesam ordens de grandeza mais que qualquer registro de banco. Com a arquitetura atual (D1 só pra escrita/leitura administrativa, tudo público servido via JSON no R2 — seção 4.4), o D1 dificilmente será o primeiro limite a doer.

**Ação recomendada:** configurar o alerta de uso do R2 (já previsto em 4.9) pra disparar em **~80% do free tier (~8 GB)**, dando margem de reação antes do teto. Custo de upgrade é baixo e previsível mesmo assim: ≈US$0,015/GB/mês acima do free tier, com **egress sempre zero** (diferencial do R2 vs. S3) — não é um susto financeiro, é um item de linha previsível.

### 4.11 Integração com portais externos (ZAP, OLX, VivaReal, Chaves na Mão) — DECISÃO FECHADA — FASE 1

Recurso considerado essencial (validado por corretor experiente do mercado): hoje é padrão de mercado um site/CRM imobiliário gerar feed automático pros grandes agregadores.

**Princípio central — divisão de responsabilidade:** nosso trabalho é **disponibilizar o arquivo pronto, no formato exigido por cada serviço, numa URL estável**. O que acontece depois que o portal recebe o arquivo — quantos anúncios ele efetivamente publica, como distribui entre sub-portais — é decidido **dentro do painel/plano do próprio serviço**, fora do nosso controle e da nossa responsabilidade. Não tentamos replicar essa lógica de distribuição do lado de cá.

**Formato:** **VRSync** (formato XML unificado atual do Grupo OLX = ZAP + VivaReal + OLX). O formato antigo "ZAP" está descontinuado — **não usar** como referência de schema.

**⚠️ Correção importante sobre granularidade:** OLX, ZAP e VivaReal **não são três integrações independentes** — hoje operam como **um único agregador (Grupo OLX)**, que lê **um único arquivo XML** via uma única URL cadastrada no Canal Pro. Não existe, no schema VRSync, um campo para dizer "esse imóvel vai só pro OLX, não pro ZAP" — essa distribuição interna entre os três é decidida pelo Canal Pro, do lado deles, com base nos planos que o corretor tem contratado com cada um. **Modelo corrigido:**

| Grupo                                                                       | Controle que temos                                                                                                              | Arquivo                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Grupo OLX** (OLX + ZAP + VivaReal)                                        | **Um toggle só** por anúncio ("Publicar no Grupo OLX"). **Uma cota só** (não três separadas) — o total elegível pro feed único. | Um XML VRSync por corretor                                               |
| **Portais realmente independentes** (ImóvelWeb, Chaves na Mão, Órulo, etc.) | Cada um com **toggle e cota próprios**, por terem URL/feed genuinamente separados                                              | Um arquivo por portal, no formato que cada um exigir (XML, CSV, JSON...) |

**Geração:** no mesmo processo em lote que já gera os JSONs (4.4), é gerado também **um arquivo por serviço externo ativo** — um XML VRSync (Grupo OLX) e, conforme o corretor for ativando outros, um arquivo adicional por portal independente, cada um no formato específico exigido. Custo adicional próximo de zero — mesma lógica em lote, só mais arquivos gerados.

**Armazenamento/entrega:** todos os arquivos (JSON da rede interna, XML VRSync do Grupo OLX, e formatos de outros portais) ficam no **mesmo domínio público único do R2** (simplificação já aprovada), diferenciados por prefixo de pasta (`/cidades/`, `/corretores/`, `/feeds/grupo-olx/{slug}.xml`, `/feeds/imovelweb/{slug}.xml`, etc.) — sem conflito entre formatos. URLs **permanentes e estáveis** (não podem mudar depois de configuradas no portal). Servidos como arquivo estático, zero invocação do Worker na leitura pelos robôs.

**Toggle de rede externa:** um controle **por serviço externo** (Grupo OLX = 1 toggle; cada portal independente = 1 toggle próprio), separado do "postar na rede" interna (4.4.1). **Diferente do toggle interno (ligado por padrão), todo toggle de portal externo nasce DESLIGADO** — o corretor ativa manualmente.

**Cota por Serviço Externo (entidade `CotaPortal` revisada) — DECISÃO FECHADA:**

- Cada corretor configura, **por serviço externo** (Grupo OLX como um todo, ou cada portal independente individualmente), a **quantidade de anúncios contratada** (ou "ilimitado").
- **A filtragem acontece do nosso lado, antes do envio** — nunca enviamos mais anúncios do que a cota contratada com aquele serviço. Ex: corretor tem 95 elegíveis mas contratou 50 no Grupo OLX → o XML gerado contém **exatamente 50**, nunca 95. Os excedentes continuam ativos normalmente na rede/minisite, só não entram naquele arquivo específico.
- **Seleção de quais entram na cota:** prioridade manual (corretor marca quais anúncios priorizar) e, se sobrar espaço, preenchido automaticamente por critério padrão (mais recentes primeiro).
- **UI no painel — seção "Configurações do Site" → "Portais Integrados":** uma linha por **serviço externo** ativado (Grupo OLX conta como uma linha só, cada portal independente é outra linha), cada linha com seu **próprio seletor numérico** de quantidade contratada (ou "Ilimitado", sem seletor numérico). **Nunca um limitador único/global.** Contador visível por linha (ex: `32/50 usados`), atualizado em tempo real.
- Independente do nosso `Plano` interno (que limita anúncios/fotos na nossa própria plataforma) — a cota por serviço externo é sobre o contrato do corretor **com aquele serviço**, que não fornecemos nem cobramos.

**Identificador imutável:** o ID do imóvel usado no XML é o próprio ID do banco D1, e **nunca muda** entre exportações — se mudar, o portal entende que o anúncio antigo foi excluído e cria um novo do zero, perdendo histórico de relevância e estatísticas acumuladas no portal pago.

**Campos obrigatórios por tipo (validação no formulário de cadastro):**

- Área Total: obrigatória para Terreno, Fazenda, Sítio, Chácara.
- Área Útil: obrigatória para os demais tipos.
- Dormitórios: obrigatório para imóveis residenciais.
- Banheiro: obrigatório, exceto Lote/Terreno/Área.
- Endereço: campo de privacidade (`ExibirEnderecoCompleto`) — corretor escolhe mostrar rua/número completos ou só bairro/cidade.
- CEP: obrigatório **só** quando o anúncio é marcado pra publicar no Grupo OLX (`anuncios.publicar_grupo_olx = true`) — não em todo cadastro. Ver "Reconstrução do feed" abaixo.

**Reconstrução do feed (correção pós-Lote 17) — schema real, não mais fictício:** auditoria encontrou que o schema XML gerado desde o Lote 12.1 (`<Property>`, `<Title>`, `<TransactionType>`, tipos em inglês tipo `"Apartment"`) nunca correspondeu à especificação real de nenhum portal brasileiro — era uma estrutura plausível, mas inventada. Corrigido com as tags reais (`CodigoImovel`, `TituloAnuncio`, `Bairro`, `Cidade`, `CEP`, `SubTipoImovel`, `Observacao`, `PrecoVenda`/`PrecoLocacao`, `AreaTotal`/`AreaUtil`, `Foto`, `Videos`) em `lib/feeds/formatadores/vrsync-olx.ts`. **Ressalva registrada:** o elemento raiz/wrapper do XML e os códigos exatos de `SubTipoImovel` por grupo não estão confirmados contra documentação oficial (não localizada em nenhuma fonte disponível no momento da correção) — ficam como placeholder `TBD_*` em `lib/vrsync-mapper.ts` até alguém confirmar contra a especificação real do Canal Pro antes do feed operar em produção de verdade.

**Escopo fechado — "Aluguel de quartos"/"Temporada" (códigos 1060/1080 da OLX) ficam de fora:** decisão explícita de não estender a taxonomia interna (`tipos_negocio` continua só Venda/Locação) nem criar campo de modalidade — o feed cobre só os tipos já existentes (Apartamentos, Casas, Terrenos/sítios/fazendas, Comércio e indústria). `PrecoLocacaoTemporada` nunca é emitida. `PrecoCondominio`/`ValorIPTU` também ficam fora desta rodada — não há coluna em `anuncios` pra isso; se a OLX rejeitar por falta delas, revisita-se com o erro real em mãos, não por suposição.

**Toggle real por anúncio — `publicar_grupo_olx` (migration 0015):** antes desta correção, o campo `priorizado` era referenciado no código de geração do feed (decidiria quem entra primeiro quando o catálogo elegível excede a cota) mas nunca esteve ligado a nenhuma coluna do banco nem a controle de UI — sempre `undefined` em produção, ou seja, a "prioridade manual" descrita acima nunca existiu de fato. `publicar_grupo_olx` (BOOLEAN por anúncio, nasce `0`) substitui esse campo morto: é o próprio filtro de elegibilidade pro feed do Grupo OLX (não basta `postar_na_rede = true`) e, dentro do conjunto marcado, a cota corta por mais recente primeiro. Escopo só do Grupo OLX — outros portais independentes continuam elegíveis via `postar_na_rede`, sem toggle próprio (decisão explícita, não estendida nesta correção). Validação de CEP roda em `routes/api-anuncios-crud.ts` no momento de criar/editar o anúncio: se o estado final tem `publicar_grupo_olx = true` e CEP vazio, a requisição é rejeitada com 400 antes de gravar.

**Disparo de geração — achado crítico:** rastreado o caminho entre "anúncio muda" e "XML é regravado no R2", e ele não existia. `jobs/revalidacao-cruzada.ts` (único ponto que roda em toda mutação de anúncio) nunca enfileirava geração de feed externo; existia até uma função pronta pra isso (`dispararGeracaoXMLGrupoOLX`, em `jobs/disparar-geracao-xml.ts`), mas nunca era chamada de lugar nenhum do código — dead code. Corrigido: `revalidacao-cruzada.ts` agora consulta `cotas_portal WHERE ativo = 1` do corretor e enfileira `gerar-feed-portal-independente` por linha; `routes/painel-corretor.ts` dispara o mesmo evento quando o corretor liga uma cota pela primeira vez (sem isso, o feed só nasceria na próxima edição de anúncio não relacionada). `jobs/disparar-geracao-xml.ts` (nunca usado) foi removido.

**Fusão de `feed-grupo-olx` em `portais_independentes` (migration 0016):** o Grupo OLX já usava o mesmo mecanismo de `cotas_portal` (`portal_nome = 'grupo-olx'`) que qualquer portal independente — a diferença real era não ter linha em `portais_independentes` e depender de uma flag própria em `modulos_ativos` (`feed-grupo-olx`, separada de `feed-portais-independentes`). Coluna nova `portais_independentes.modulo_flag_slug` torna essa checagem um dado por linha, não um caso especial no código — Grupo OLX aponta pra `feed-grupo-olx`, os demais pra `feed-portais-independentes`. Módulo `modulos/feed-grupo-olx/` (rota + gerador, ~370 linhas quase idênticas ao gerador genérico) foi removido; `modulos/feed-portais-independentes/` passou a ser o único gerador/rota pra qualquer portal externo. URL pública não muda (`/feeds/grupo-olx/{slug}.xml` já batia no padrão genérico `/feeds/{portal}/{slug}.{ext}`), então nenhuma URL já colada por um corretor no Canal Pro quebra.

**Núcleo compartilhado (`lib/feeds/`):** `core.ts` centraliza a busca+validação+sanitização de um anúncio pra exportação (antes duplicada quase palavra-por-palavra entre os dois geradores) e `resolverPrecos()`, que corrige o bug de precedência de preço — antes `preco_venda || preco_aluguel` escolhia qual campo estava preenchido, ignorando `tipo_negocio_slug`; agora decide pela classificação real do anúncio. `registry.ts` despacha por `portais_independentes.formato` (hoje só `vrsync-xml` tem formatador); Chaves na Mão ou qualquer outro portal com schema próprio entra como um novo formatador em `lib/feeds/formatadores/`, sem duplicar o núcleo — a especificação de tags do Chaves na Mão (`cnm-xml-documentation`, citada acima) não foi localizada em nenhuma fonte disponível, então o formatador em si ainda não foi escrito, só a arquitetura que o recebe.

**Sanitização real da descrição (`lib/sanitize.ts`):** antes, `sanitizarParaXML` só fazia `trim()` + remoção de emoji — não removia HTML nem limitava tamanho. Pipeline novo (`sanitizarParaExportacao`, usado só na exportação pra feed, não no caminho de escrita do CRUD): remove tags HTML de verdade (iterativo, não escapa) → normaliza espaços → remove emoji/controle → trunca em 6.000 caracteres no limite de palavra mais próximo → `escaparXML` continua sendo o último passo, só no momento de montar a tag.

**Pendência conhecida, não corrigida nesta rodada — formulário de anúncio do painel do corretor:** auditado durante esta correção, `public/assets/js/painel.js::enviarFormAnuncio` é um placeholder (`alert("Salvar anúncio (integração com /painel/anuncios POST do Lote 5)")`) — nunca chama `POST /api/anuncios` de verdade, e os selects de taxonomia/cidade são valores estáticos hardcoded, não vindos do banco. O backend desta correção (coluna `cep`, toggle `publicar_grupo_olx`, validação) está pronto e testado; o checkbox e o campo de CEP no formulário do corretor ficam sem front-end funcional até essa reconstrução do formulário (fora do escopo desta correção) acontecer — mesma classe de achado já registrada várias vezes no Histórico de Decisões (seção 11): caminho nunca exercitado, só aparece auditando o fluxo real, não a revisão de arquivo isolado.

**Tabela de-para:** mapeamento entre a taxonomia interna (seção 5.3) e a taxonomia esperada por cada portal — necessária na geração do XML.

**Cada portal externo tem seu próprio schema — confirmado, não é suposição — DECISÃO FECHADA:** o **Grupo OLX** aceita XML (VRSync) ou JSON próprio (categorias/códigos proprietários, ex: `category: 1020` = Apartamentos, `apartment_type: 3` = Duplex/triplex — formato de lista de operações `insert`/`update`/`delete`, não uma modelagem de estado). O **Chaves na Mão** usa um **XML com especificação de tags própria e diferente**, documentada separadamente (`cnm-xml-documentation`) — não reaproveita nada do schema da OLX. Outros portais (ImóvelWeb, Órulo etc.) devem seguir o mesmo padrão: cada um com seu próprio formato.

**Implicação de arquitetura — nosso schema interno nunca deve ser moldado pra copiar o de nenhum portal externo específico:** o D1/`modelos.ts` continua sendo o schema **rico e canônico** (com corretor, "postar na rede", CRECI, Plano, config de módulos, nossa própria taxonomia de 5 categorias). Cada portal externo ganha seu **próprio mapeador** (`lib/vrsync-mapper.ts` pro Grupo OLX; futuramente `lib/chaves-na-mao-mapper.ts`, `lib/imovelweb-mapper.ts` etc.), todos convertendo **a partir** do nosso schema canônico — nunca o contrário. Isso evita acoplar nosso modelo de dados às decisões de um fornecedor externo (ex: a OLX já sinaliza uma "Fase 2" da API deles) e preserva os campos que só existem na nossa plataforma.

**Geração sempre por corretor, nunca um arquivo global por portal — reforço de 4.4/4.5.1:** cada corretor tem sua própria cota (`CotaPortal`) e sua própria URL de feed cadastrada individualmente no painel de cada serviço externo (ex: Canal Pro da OLX). Por isso a Queue gera **um arquivo por combinação (corretor × destino)** — `/feeds/grupo-olx/{slug}.xml`, `/feeds/chaves-na-mao/{slug}.xml` — nunca um arquivo único agregando todos os corretores da rede para um mesmo portal. Isso é diferente do JSON de cidade (4.4.1), que **é** agregado entre corretores — a agregação por cidade faz sentido pro nosso próprio portal, mas não faz sentido pra um portal externo, que não compartilha cota entre corretores diferentes.

**Como o corretor ativa (responsabilidade do corretor, não da plataforma):**

1. Corretor precisa ter conta e plano próprio contratado diretamente no Canal Pro (Grupo OLX) — isso não é fornecido nem cobrado por nós.
2. Corretor pega a URL do feed (`/feeds/{slug}.xml`) gerada pelo nosso painel.
3. Cola essa URL no Canal Pro: login → "Configurações da conta" → "Integração de anúncios".
4. Robôs do Grupo OLX processam o arquivo a cada ~12h automaticamente.

**Caminho opcional futuro (não fase 1):** solicitar ao Grupo OLX o cadastro do "imobiliarista.net" como software integrador oficial reconhecido (lista de +450 softwares já cadastrados) — deixaria a conexão mais profissional (corretor seleciona da lista em vez de colar URL manualmente), mas não é obrigatório pra funcionar. Solicitação feita via canais de ajuda ao anunciante do Grupo OLX (developers.grupozap.com).

### 4.12 IA como assistente de busca — só no Portal, não nos minisites — DECISÃO FECHADA — FASE 1

**Ferramenta:** Cloudflare Workers AI — free tier permanente (10.000 Neurons/dia, sem cartão de crédito, ~80 modelos disponíveis), acessada via binding (mesma conta, sem chave de API externa a gerenciar).

**Onde entra e onde NÃO entra — justificativa de posicionamento, não só técnica:**

- **Só no Portal Principal (`imobiliarista.net`).** Não existe um corretor específico atendendo ali — é uma rede de centenas de corretores diferentes. A IA preenche esse vazio: vira a **"corretora virtual" da rede**, elemento de identidade/marca do portal como um todo.
- **NUNCA nos minisites (`nome.imobiliarista.net`).** No minisite, o corretor **é** a pessoa atendendo — colocar IA ali faria o trabalho que é papel dele, competindo com sua própria função. Os filtros simples que o minisite já tem são suficientes (mostra só os anúncios de 1 corretor, poucas centenas no máximo).

**Função (fase 1):** assistente de busca em linguagem natural. Visitante digita algo tipo *"apartamento de 2 quartos em Londrina até R$ 400 mil"* → a IA interpreta a frase e devolve os filtros estruturados (cidade, tipo de negócio, categoria, faixa de preço, quartos...) → o JavaScript do navegador aplica esses filtros sobre o JSON **já baixado** (sem tocar no D1, sem gerar conteúdo novo salvo no anúncio).

**Por que essa função específica evita o problema de conteúdo duplicado (SEO):** diferente de gerar uma descrição de anúncio (texto fixo, gravado no D1, replicado em cidade.json e corretor.json, criando duplicação entre portal e minisite), o assistente de busca é **interativo e não grava nada novo** — não há texto duplicado para o Google penalizar. Geração automática de descrição de anúncio via IA fica **descartada** por esse motivo (registrado aqui para não ser reconsiderada sem essa ressalva).

**Custo:** cada busca consome uma fração pequena da cota diária de Neurons — folgado dentro do free tier para o volume esperado na fase 1.

**Proteção contra abuso — Rate Limiting Rules (Cloudflare) — DECISÃO FECHADA:** a rota do Worker que processa a busca por IA (ex: `/api/busca-ia`) é protegida por uma **Rate Limiting Rule por IP** (ex: 20 buscas/hora por IP), configurada na borda da Cloudflare — disponível em regras simples baseadas em IP mesmo no plano Free. Isso barra o abuso **antes** de consumir Neurons, protegendo a cota diária compartilhada de ser esgotada por um único visitante mal-intencionado e derrubando a busca inteligente pra todo mundo no resto do dia.

### 4.13 Backup e recuperação de desastre do D1 — DECISÃO FECHADA

- **Camada principal — Time Travel (nativo do D1):** restaura o banco para qualquer minuto dos últimos 30 dias. Sempre ativo por padrão, sem necessidade de configuração, sem custo adicional. Cobre o cenário mais comum: erro humano (UPDATE/DELETE sem WHERE), migration com problema, bug recente. Restauração via `wrangler d1 time-travel restore` apontando timestamp ou bookmark.
- **Camada de reforço — export periódico para R2:** Cron Trigger mensal executa `wrangler d1 export` (dump SQL) e salva o arquivo no bucket **privado dedicado** `BACKUP_PRIVADO`/`imob-backup-privado` (seção 4.3) — nunca em `DADOS_CACHE`/`imob-dados`, que tem Custom Domain público por desenho —, para retenção além dos 30 dias do Time Travel e como cópia redundante fora do D1. Custo irrisório dado o tamanho do banco no volume projetado. Ver incidente de segurança e correção estrutural no Histórico de Decisões (2026-08-19).

### 4.14 Padrão de URL do anúncio (slug + ID) — DECISÃO FECHADA

```
imobiliarista.net/{cidade}/{tipo-negocio}/{tipo-imovel}/{slug-anuncio}-{id}
```

Exemplo: `imobiliarista.net/londrina/venda/apartamento/lindo-apto-3-quartos-gleba-1042`

- `{slug-anuncio}`: gerado a partir do título do anúncio (minúsculo, sem acento, espaços viram hífen).
- `{id}`: ID numérico do D1, sempre no final. Garante **unicidade** mesmo que dois corretores diferentes usem títulos parecidos na mesma cidade — nunca há colisão de rota.
- Também facilita busca rápida no front-end (basta ler o `id` depois do último hífen) e preserva a estrutura amigável de SEO no restante da URL.

### 4.15 Normalização/sanitização de strings na entrada — DECISÃO FECHADA

**Problema que resolve:** bairro digitado de formas diferentes pelo corretor (`"Gleba Palhano"`, `"gleba palhano"`, `"Gleba Palhano - Zona Sul"`) fragmenta filtros e o particionamento por região (4.4.2) sem necessidade. Emojis/caracteres especiais no título podem fazer parsers de XML de portais externos (ZAP/OLX) rejeitarem a carga inteira.

**Pipeline de sanitização, aplicado na entrada da API (Worker), antes de gravar no D1:**

- `trim()` + capitalização padronizada em campos de texto livre usados como filtro (Bairro/Região).
- Remoção de emojis e caracteres especiais não suportados antes de qualquer campo entrar no XML VRSync (4.11) — evita rejeição de carga inteira por parser legado.

### 4.16 Sitemap.xml e robots.txt — DECISÃO FECHADA

**Problema que resolve:** toda a estratégia de SEO já fechada (dynamic rendering pra bots, canonical, particionamento) não tem valor se o Google não descobre as URLs — faltava o mecanismo de descoberta.

**robots.txt:** servido dinamicamente pelo Worker (varia por hostname — portal vs. minisite), com `Disallow: /painel/`, `Disallow: /painel-admin/` e `Disallow: /api/`, `Allow: /`, e a linha `Sitemap:` apontando pro sitemap daquele host específico. Rotas utilitárias (`/apps/*`, ver 4.18) marcadas `noindex,follow`.

**sitemap.xml do Portal Principal:** gerado no mesmo processo em lote que já gera os JSONs/XMLs (4.4, 4.11) — não por requisição. Estrutura em **índice de sitemaps** (respeitando o limite do Google de 50.000 URLs/50 MB por arquivo):

```
/sitemap-index.xml          → aponta para os arquivos abaixo
/sitemap-cidades.xml        → URLs de /{cidade}, /{cidade}/{negocio}/{categoria}
/sitemap-anuncios-{n}.xml   → URLs de anúncios individuais, paginado por tamanho
```

**sitemap.xml de cada Minisite:** gerado no mesmo lote que o `{slug}.json` do corretor — arquivo pequeno, só com os anúncios daquele corretor (e, quando aplicável, os posts de Publicações — ver 4.19).

Todos servidos como arquivo estático no R2 (mesmo domínio único já decidido em 4.11), zero invocação do Worker na leitura pelo Googlebot.

### 4.17 Anúncio vendido/removido — HTTP 410, não 404 — DECISÃO FECHADA

**Problema que resolve:** a URL de um anúncio vendido/removido (`/londrina/venda/apartamento/nome-1042`) não pode simplesmente sumir (404 é ambíguo pro Google — "não existe" vs. "não existe mais") nem continuar ativa como se nada tivesse acontecido.

**Solução:**

- Anúncio ganha um status "vendido/removido" (além do toggle "postar na rede" já existente).
- Para o **Googlebot** (já identificado via User-Agent no dynamic rendering, 4.6): a URL responde **HTTP 410 Gone**, o status correto e explícito para "isso existiu e foi removido de propósito" — ajuda o Google a desindexar mais rápido, ao contrário do 404 (ambíguo).
- Para o **visitante humano**: a mesma URL mostra uma página amigável — *"Este imóvel não está mais disponível"* + grid de anúncios semelhantes (mesma cidade/categoria, montado a partir do JSON que o navegador já tem em cache — sem requisição extra).
- O anúncio removido também **sai do sitemap.xml** na próxima geração em lote (4.16), mantendo consistência entre os dois mecanismos.

### 4.18 Módulo PWA (App Instalável) — DECISÃO FECHADA

**Disponibilidade — duplo controle:**
- **Nível rede:** flag `pwa` em `modulos_ativos` (D1) — Superadmin liga/desliga o módulo pra rede inteira, efeito imediato.
- **Nível corretor:** campo `permitePwa` (booleano) no **Plano** (ver 5.1, 6.3) — só corretores em planos com esse campo ligado têm PWA gerado no minisite deles.
- **Portal Principal** (`imobiliarista.net`): PWA não depende de Plano nenhum — é da rede como um todo, controlado só pela flag global de `modulos_ativos`.
- Um corretor só tem PWA no minisite se **ambas** as condições forem verdadeiras: módulo ligado na rede **e** `permitePwa = true` no plano dele.

**UX — sem banner automático:** `beforeinstallprompt` suprimido globalmente (`e.preventDefault()`) em todas as páginas (portal e minisites). Prompt só é oferecido sob ação explícita do visitante, numa página dedicada — nunca empurrado via mini-infobar do navegador.

**Rotas dedicadas** (replicadas em `imobiliarista.net/apps/*` e, quando habilitado, em `{slug}.imobiliarista.net/apps/*`):

| Rota | Comportamento |
|---|---|
| `/apps` | Escolha entre Android e iPhone. Avisa se o app já estiver instalado (`display-mode: standalone`). |
| `/apps/android` | Aciona `beforeinstallprompt` → `.prompt()` sob toque do visitante. Estados: aguardando, pronto, já instalado, não suportado. |
| `/apps/iphone` | Tutorial estático de 3 passos (Compartilhar → Adicionar à Tela de Início → Adicionar). Detecta in-app browser (Instagram/WhatsApp) e avisa, já que o botão de Compartilhar necessário não aparece nesse caso. |

**Local no menu:** rodapé, não menu principal — menu principal do portal/minisite fica focado em conversão (buscar imóvel, falar com corretor).

**Estratégia de cache do Service Worker:**

| Conteúdo | Estratégia | Motivo |
|---|---|---|
| Casca institucional (shell HTML/CSS/JS, `manifest.json`, páginas `/apps/*`) | Cache-first, nome de cache versionado (ver 4.6.1) | Muda pouco; trocar de versão invalida o cache antigo automaticamente (`skipWaiting()` + `clients.claim()`). |
| **JSONs de anúncio** (`cidade.json`, `corretor.json`, `_index.json`) e **feed de Publicações** (4.19) | **Network-only, sem fallback de cache** | Nunca servir anúncio/post desatualizado como se fosse atual. Se offline, o próprio JS do front-end detecta `navigator.onLine` e mostra aviso "sem conexão", em vez do SW mentir com dado velho. |

**Service Worker "suicida" (desativação do módulo ou downgrade de plano):** se o módulo estava ativo pro corretor na versão anterior (seja por toggle global desligado ou por downgrade de plano — ver 6.4) e deixa de estar, a próxima regeneração do minisite gera um `service-worker.js` mínimo que limpa todo cache local (`caches.delete`), desregistra a si mesmo (`unregister()`) e força reload das abas abertas — evita apps "zumbis" continuando a rodar cache velho no dispositivo do visitante sem saber que o corretor perdeu o PWA.

```javascript
// service-worker.js "suicida" — gerado só na publicação que desativa o módulo PWA
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', async () => {
  const nomes = await caches.keys();
  await Promise.all(nomes.map((nome) => caches.delete(nome)));
  await self.registration.unregister();
  self.clients.matchAll().then((clients) => clients.forEach((c) => c.navigate(c.url)));
});
```

**Fallback de ícone:** `manifest.json` nunca aponta pra arquivo inexistente. Se o corretor ainda não tem logo processável (formato/dimensão válidos), usa ícone genérico da rede (`icon-192.webp`/`icon-512.webp` do `imobiliarista.net`, asset compartilhado no R2) em vez de quebrar o manifest.

**SEO:** rotas `/apps/*` marcadas `noindex,follow` e excluídas do `sitemap.xml` (4.16) — são utilitárias, não conteúdo institucional.

**Push Notifications:** fora de escopo deste módulo — candidato a módulo futuro separado (exige armazenamento de inscrição por visitante no D1, servidor de envio próprio com chaves VAPID, consentimento LGPD explícito).

**Estrutura de arquivos:** módulo isolado em `src/modulos/pwa/` (`rota.ts`, `gerador-manifest.ts`, `gerador-service-worker.ts`), seguindo o padrão de 4.2.1. Gerado no mesmo processo em lote que já gera os demais artefatos por corretor (4.4), respeitando a dupla checagem de flag (rede + plano).

### 4.19 Módulo Publicações — DECISÃO FECHADA

**Disponibilidade:** `opcional`, exclusivo dos planos com `permitePublicacoes = true` (Planos 2 a 5 no seed inicial — ver 5.1.3). Controle duplo, mesmo modelo do PWA: flag `publicacoes` em `modulos_ativos` (rede) **+** `permitePublicacoes` no Plano do corretor.

**Só no minisite** (`{slug}.imobiliarista.net`), nunca no Portal Principal — item aparece no **menu de navegação principal** do minisite (diferente do PWA, que fica no rodapé).

**Fluxo de ativação (painel do corretor):**
1. Corretor ativa "Publicações" no painel.
2. Escolhe, mutuamente exclusivo:
   - **(a) Feed próprio** — cola a URL do feed do Blogspot dele (`https://seublog.blogspot.com/feeds/posts/default`);
   - **(b) Feed Padrão da Rede** — usa o blog institucional mantido pela equipe `imobiliarista.net`, com conteúdo genérico de interesse comum ("Notícias de Imóveis"), sem necessidade de configuração adicional.
3. Escolha salva em `corretor.config_modulos.publicacoes` → `{ feedUrl, usarFeedPadrao }`.
4. Próxima geração em lote (4.4) grava essa config no `corretor.json` e adiciona o item "Publicações" ao menu do minisite.

**Fluxo de entrega ao visitante (zero D1/R2/Worker na leitura do feed em si):**

```
Visitante acessa {slug}.imobiliarista.net/publicacoes
  → Static Assets entrega o shell da SPA (fluxo normal, sem exceção)
  → JS do navegador lê corretor.json (já em cache) pra saber qual feed usar
  → JS faz fetch() direto no feed do Blogspot (próprio ou Feed Padrão da Rede)
  → Monta listagem e roteamento client-side
  → Mídia (fotos/vídeos do post) servida direto pela infra do Google — nunca passa pelo R2/Worker
```

**Endereçamento de post individual — path routing (DECISÃO FECHADA):**

```
{slug}.imobiliarista.net/publicacoes/{id-do-post}
```

Consistente com o padrão de URL limpa já usado pros anúncios (4.14). Rota tratada em `routes/minisite.ts` — nosso Worker já faz roteamento por hostname (4.1) e não tem a limitação de "Worker burro" que exigiria hash routing em outras arquiteturas.

**Cache do Service Worker:** mesmo tratamento dos JSONs de anúncio (4.18) — **network-only**, nunca cacheado. Nunca servir post desatualizado; offline mostra aviso "sem conexão".

**Feed Padrão da Rede:** Blogspot institucional mantido pela equipe `imobiliarista.net`, conteúdo genérico "Notícias de Imóveis". Múltiplos minisites podem consumir simultaneamente, sem custo adicional — leitura ocorre no navegador de cada visitante, não em infraestrutura própria. Corretor pode alternar entre feed próprio e Feed Padrão a qualquer momento, sem perda de histórico (nada é armazenado localmente além da URL escolhida).

**Desativação/downgrade:** módulo desativado ou plano rebaixado sem `permitePublicacoes` (ver 6.4) → próxima publicação remove o item de menu e a rota deixa de ser servida. URL do feed permanece salva no D1 pra reativação futura.

**Responsabilidade de conteúdo:** feed próprio = responsabilidade editorial, direitos autorais e LGPD do corretor (gerenciado inteiramente no painel do Blogger, fora da plataforma). Feed Padrão da Rede = responsabilidade da equipe `imobiliarista.net`.

**SEO:** posts individuais (`/publicacoes/{id}`) entram no sitemap.xml do minisite (4.16), já que têm URL própria indexável.

**Estrutura de arquivos:** `src/modulos/publicacoes/` (`rota.ts`, `logica.ts`), seguindo o padrão de 4.2.1.

**Armazenamento de config por corretor — precedente de schema (registrado após implementação do Lote 16):** criada coluna genérica `corretores.config_modulos` (JSON), não uma coluna específica pra Publicações — nenhum módulo anterior (incluindo PWA) precisava de configuração por corretor além da checagem de flags. Publicações é o primeiro módulo com opt-in configurável pelo próprio corretor (escolha de feed próprio vs. Feed Padrão), então esse campo nasce genérico de propósito: `config_modulos.publicacoes = { feedUrl, usarFeedPadrao }`, deixando espaço pra módulos futuros guardarem sua config na mesma coluna sem precisar de migration nova cada vez.

### 4.20 Backup e Exportação de Anúncios pelo Corretor — DECISÃO FECHADA

Duas necessidades distintas, dois formatos diferentes — não devem ser confundidos nem unificados (ver justificativa em 4.11).

**(a) Backup interno — uso próprio do corretor, dentro da nossa plataforma:**

- `GET /api/anuncios/backup` — endpoint autenticado no painel do corretor. Consulta o D1 filtrando só os anúncios daquele corretor e monta um JSON completo **no nosso próprio schema** (mesmo modelo de `types/modelos.ts`): todos os campos administrativos, todos os campos de todas as fotos (thumbnail + full-size), **como links pro R2 — nunca o binário da foto em si**.
  - **Motivo de não empacotar as fotos:** as fotos no R2 já são versões processadas (WebP, thumbnail + full-size, ver 4.7) — o arquivo original nunca é guardado por decisão nossa. Reempacotar geraria leitura desnecessária do R2 e duplicação de armazenamento sem ganho real de segurança: a durabilidade do R2 como object storage e o backup de plataforma (D1 Time Travel + export mensal, seção 4.13) já cobrem o cenário de perda catastrófica. Se o R2 falhasse a ponto de perder as fotos, seria um incidente maior que um backup individual resolveria de qualquer forma.
- `POST /api/anuncios/restaurar` — upload do mesmo JSON de volta.
  - **Modo seguro por padrão:** só cria anúncios que ainda não existem (checagem por ID); nunca sobrescreve um anúncio existente sem uma ação explícita e separada de "substituir".
  - Validação contra os limites do Plano atual antes de gravar (rejeita import que ultrapasse `maxAnuncios`/`maxFotosPorAnuncio`).
- **Não é feature de módulo** (não entra em `src/modulos/`) — é funcionalidade core de portabilidade de dados, disponível a todo corretor independente de Plano. Endpoints adicionados a `routes/api-anuncios.ts`.

**(b) Exportação em formato de mercado — uso externo, via de mão única:**

- `GET /api/anuncios/exportar/{portal}` (ex: `.../exportar/olx-json`, `.../exportar/chaves-na-mao-xml`) — reaproveita os mapeadores já planejados em 4.11 (`vrsync-mapper.ts` e equivalentes futuros) pra gerar sob demanda o arquivo no formato de importação daquele portal específico.
- **Não é formato de restauração** — é saída, não entra de volta pela rota `/restaurar` (schema incompatível com o nosso, com perda de campos administrativos nossos — ver justificativa completa em 4.11).
- Diferente do feed automático já existente por corretor (4.11, regenerado a cada mudança), esta é uma exportação avulsa, sob demanda, útil pro corretor levar uma cópia dos dados pra outro serviço compatível a qualquer momento.

**Automação/armazenamento — modelo de URLs (reforço, ver 4.4.1 e 4.11):**

```
R2 (DADOS_CACHE)
├── /cidades/{cidade}.json              ← agregado por cidade, nossa rede
├── /corretores/{slug}.json             ← individual, nosso minisite
├── /feeds/grupo-olx/{slug}.xml         ← individual por corretor, nunca agregado
├── /feeds/chaves-na-mao/{slug}.xml     ← individual por corretor, formato próprio do portal
└── /feeds/{outro-portal}/{slug}.{fmt}  ← um mapeador por portal, sempre por corretor
```

Backup interno (`/api/anuncios/backup`) e exportação de mercado (`/api/anuncios/exportar/{portal}`) são gerados **sob demanda** (ação explícita do corretor no painel), não fazem parte do lote automático em Queue — diferente dos feeds de 4.11, que são regenerados automaticamente a cada mudança de dado.

---

## 5. Modelo de Dados

### 5.1 Entidades principais (a detalhar campos)

| Entidade         | Descrição                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anúncio          | Imóvel cadastrado, com dados, fotos, status "na rede" (interna, padrão ligado), status por portal externo (ZAP/OLX/VivaReal/ImóvelWeb, cada um independente, padrão desligado) e status "vendido/removido" (dispara HTTP 410, ver 4.17) |
| Corretor/Usuário | Dono de um minisite e de seus anúncios. Campos imutáveis: nome completo, sexo, data de nascimento, nacionalidade, CPF (=login), CRECI. Campos editáveis: endereço residencial, telefone, e-mail, WhatsApp (ver 6.1.1) |
| Minisite         | Site individual do corretor (`nome.imobiliarista.net`)                                                                                                                                                   |
| Cidade           | Unidade de agrupamento geográfico para os JSONs                                                                                                                                                          |
| Plano            | Limites e preço contratados **conosco**: máx. de anúncios, máx. de fotos, taxa de adesão, mensalidade, acesso a PWA/Publicações, permissão de API Google Maps (ver 5.1.3, 6.3, 6.4)                     |
| CotaPortal       | Contrato do corretor **com um serviço externo** — que pode ser o **Grupo OLX** (OLX+ZAP+VivaReal, tratado como um único serviço/feed) ou um **portal independente** (ImóvelWeb, Chaves na Mão, Órulo...): quantidade de anúncios contratada (ou ilimitado), usada para limitar o arquivo gerado por serviço |
| PreCadastro      | Registro pendente enviado pelo próprio corretor (nome, e-mail, telefone, CRECI), aguardando aprovação do Superadmin — não gera conta nem site até ser aprovado (ver 6.1). Inclui `aceite_termos_em` (timestamp) e `versao_termos_aceita` |

### 5.1.1 Campos de filtro/busca do Anúncio (base: componente de referência do usuário)

Identificados a partir de um componente HTML de busca avançada trazido pelo usuário como referência de layout (sem lógica funcional, sem back-end real — só estrutura de campos):

- Região/Bairro (zonas: Central, Norte, Sul, Leste, Oeste, Rural — ajustar valores reais por cidade)
- Área do terreno (m²)
- Área construída (m²)
- Salas (qtd.)
- Cozinhas (qtd.)
- Quartos (qtd.)
- Banheiros (qtd.)
- Vagas de garagem (qtd.)
- Lavanderias (qtd.)
- Faixa de preço (até um valor)

### 5.1.2 Vídeo (YouTube) e Tour Virtual 360° — DECISÃO FECHADA

**Vídeo do YouTube — abordagem 100% oficial/legítima (sem risco de ToS):**

- Corretor cola a URL normal do YouTube no formulário de cadastro (qualquer formato: desktop, mobile, shorts, `youtu.be`).
- Extração do ID limpo no cadastro:

```javascript
function getYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}
```

- Só o **ID limpo** (11 caracteres) é gravado no D1 e exportado nos JSONs (`cidade.json`, `corretor.json`) — nunca a URL completa.
- Player no front-end, usando `youtube-nocookie.com` (modo privacidade reforçada oficial) e só parâmetros que **ainda funcionam de verdade** (`rel=0`, `playsinline=1`, `controls=1` — `modestbranding` e `showinfo` foram descontinuados pelo YouTube em 2023 e não têm mais efeito):

```html
<div class="aspect-video w-full rounded-xl overflow-hidden shadow-lg border bg-black">
  <iframe
    src="https://www.youtube-nocookie.com/embed/ID_DO_VIDEO?rel=0&playsinline=1&controls=1"
    title="Vídeo do Imóvel"
    class="w-full h-full"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    loading="lazy">
  </iframe>
</div>
```

- **Descartado por decisão consciente:** técnicas de "CSS masking" pra esconder o logo/marca do YouTube, e qualquer tentativa de "bloqueio de propaganda" — a primeira viola as diretrizes de marca do YouTube (risco real de embed desabilitado ou problema pro canal do corretor), a segunda é **tecnicamente impossível** hoje (YouTube permite anúncio em qualquer vídeo embedado, sem parâmetro de URL capaz de desativar isso).
- Nota de privacidade: `youtube-nocookie.com` evita cookies **antes** do play, mas ainda pode registrar cookies de rastreamento **após** o visitante clicar em play — não é "zero rastreamento", é privacidade reforçada (relevante para a futura política de privacidade/LGPD).

**Tour Virtual 360°:**

- Campo de URL simples (ex: link do Matterport ou serviço equivalente escolhido pelo corretor) — armazenado e exibido como está, sem tratamento especial de marca/embed (diferente do YouTube, não há questão de ToS aqui).

### 5.1.3 Planos de referência — seed inicial — DECISÃO FECHADA

Editáveis a qualquer momento pelo Superadmin (ver 6.3) — os valores abaixo são o **seed inicial** da tabela `planos`, não valores hardcoded no código.

| Plano | Anúncios | Fotos/Anúncio | PWA | Publicações | Adesão (única) | Mensalidade |
|---|---|---|---|---|---|---|
| Plano 1 | 100 | 10 | ❌ | ❌ | R$ 199,00 | R$ 49,00 |
| Plano 2 | 200 | 15 | ✅ | ✅ | R$ 199,00 | R$ 69,00 |
| Plano 3 | 300 | 20 | ✅ | ✅ | R$ 199,00 | R$ 79,00 |
| Plano 4 | 400 | 25 | ✅ | ✅ | R$ 199,00 | R$ 89,00 |
| Plano 5 | 500 | 30 | ✅ | ✅ | R$ 199,00 | R$ 99,00 |

A taxa de adesão (R$ 199,00) é **igual em todos os planos** e cobrada **apenas uma vez**, na primeira contratação do corretor (ver 6.4).

### 5.1.4 Tabelas auxiliares criadas na implementação do Lote 14 — registrado após o fato

A tabela `planos` original (schema antigo, 1 linha por corretor, com `max_resolucao_upload_bytes` e `google_maps_api_key`) foi **renomeada para `config_upload_corretor`** na migration `0010_planos.sql`, para não colidir com o catálogo novo. Ela continua existindo — guarda só o que é genuinamente configuração *por corretor* (não faz parte do catálogo de planos): limite de resolução/tamanho de upload e a chave própria do Google Maps (quando o corretor usa a opção premium, ver 4.7 e 2.1).

Tabela `log_isencao` criada para a auditoria descrita em 6.6 (quem alterou, quando, valor anterior → novo, motivo).

### 5.2 Relacionamentos

- Um Corretor tem um Minisite e um Plano.
- Um Corretor tem muitos Anúncios.
- Um Anúncio pertence a uma Cidade e a um Corretor.
- Um Anúncio pode estar "na rede" (visível em todos os domínios) ou restrito ao Minisite.
- Um Anúncio tem um Tipo de Negócio e uma Categoria/Tipo de Imóvel (ver 5.3).

### 5.3 Taxonomia de Categorias — DECISÃO FECHADA

Usada na URL (`/cidade/tipo-negocio/categoria/tipo-imovel`), nos filtros de busca e no cadastro do anúncio.

**Tipo de Negócio:**

- Venda
- Locação

**Categoria → Tipo de Imóvel:**

| Categoria   | Tipos de Imóvel                                                  |
| ----------- | ----------------------------------------------------------------- |
| Residencial | Apartamento, Área, Casa, Chácara, Cobertura, Terreno             |
| Comercial   | Área, Barracão, Casa, Galpão, Loja, Prédio, Sala, Salão, Terreno |
| Corporativo | Área, Barracão, Casa, Galpão, Loja, Prédio, Sala, Salão, Terreno |
| Industrial  | Área, Barracão, Galpão, Salão, Terreno                           |
| Rural       | Área, Casa, Chácara, Fazenda, Sítio, Terreno                     |

### 5.4 Catálogo de Cidades — base oficial IBGE — DECISÃO FECHADA

**Fonte:** catálogo completo pré-carregado a partir da API oficial e gratuita do IBGE (servicodados.ibge.gov.br) — **5.570 municípios brasileiros**, estruturados em hierarquia **Brasil → Estado (UF) → Cidade**, com código IBGE, nome, UF e **latitude/longitude** de cada município. Importação única na criação do banco (seed inicial do D1), não recriada manualmente cidade por cidade.

**Modelo de controle:**

- **Não existe "liberar cidade" por pedido de corretor** — todas as cidades reais do Brasil já existem no catálogo desde o início. No pré-cadastro, o corretor só **seleciona** Estado → Cidade num seletor em cascata (dropdown dependente).
- **CRUD de cidades pelo Superadmin** continua existindo, mas como manutenção excepcional (corrigir nome, desativar uma cidade por decisão de negócio, adicionar algo fora do padrão IBGE) — não como aprovação recorrente.
- **O controle de entrada real está no corretor, não na cidade** (verificação de CRECI, seção 6.1) — e como o CRECI no Brasil é emitido por estado (CRECI-PR, CRECI-SP...), a verificação já cross-checa se o corretor tem licença pra atuar naquele estado.
- **JSON de cidade é gerado só quando há conteúdo real** — uma cidade sem corretor aprovado simplesmente não tem arquivo (ou fica vazio); não precisa de ativação manual, "acorda" sozinha com o primeiro anúncio real.

**Geolocalização do visitante integrada ao filtro:** usando `navigator.geolocation` (API nativa do navegador, já decidida em 3), a coordenada do visitante é comparada com a **latitude/longitude de cada cidade já presente no catálogo IBGE** (cálculo de distância no próprio JS do navegador, sem chamada ao Worker) para **sugerir/pré-preencher automaticamente a cidade mais próxima** no filtro da home — sem custo de servidor, sem API paga de geocoding.

---

## 6. Regras de Negócio

- Todo anúncio nasce com "postar na rede" **ligado por padrão**; o corretor pode desligar, e nesse caso o anúncio some da rede e fica visível só no minisite dele.
- Corretor só pode ver/editar/excluir seus próprios anúncios.
- Cada corretor tem exatamente um minisite (`nome.imobiliarista.net`).
- Limites do Plano são aplicados no momento da inclusão (bloqueio ao ultrapassar máx. de anúncios ou fotos).
- Visitante público **nunca** acessa D1 diretamente — sempre via JSON em cache no R2.
- JSONs de cidade só são regenerados por mudança de dado (evento de escrita), nunca por leitura.

### 6.1 Onboarding de corretor — pré-cadastro público com acesso imediato ao painel, site liberado só após aprovação — DECISÃO FECHADA

Corretor **inicia o processo sozinho**, com acesso ao painel desde o pré-cadastro — mas o **site público** e a **publicação de anúncios** dependem de aprovação do Superadmin. Fluxo:

1. **Corretor preenche um formulário público de pré-cadastro** (dados básicos: nome, e-mail, telefone, número do CRECI, senha de acesso), protegido por **Cloudflare Turnstile** (captcha gratuito e ilimitado, mesma conta Cloudflare, modo "Managed" adaptativo — geralmente invisível pra usuário legítimo) para impedir cadastro automatizado/spam.
2. **Aceite explícito obrigatório dos Termos de Uso e da Política de Privacidade** — checkbox não pré-marcado ("li e aceito..."), sem o qual o formulário não é enviado. Ao aceitar, o sistema grava no D1 o timestamp do aceite e a versão do documento aceita (prova de consentimento para a LGPD).
3. **A conta é criada imediatamente** — corretor já recebe login/senha e **acesso ao painel**. Pode ir completando os dados do site (perfil, sobre, contato, configurações) enquanto aguarda aprovação.
4. **O pré-cadastro aparece no painel do Superadmin**, numa fila de aprovação.
5. **Superadmin confere os dados e verifica o CRECI** — processo manual, feito diretamente no site oficial do CRECI (consulta pessoal, sem integração automatizada) — confirma licença profissional válida.
6. **Enquanto não aprovado:** a conta existe e o corretor consegue logar e editar dados no painel, **mas o site (`nome.imobiliarista.net`) fica OFFLINE** (não acessível publicamente) e **nenhum anúncio pode ser publicado/liberado na rede** — o corretor pode cadastrar/rascunhar anúncios, mas eles ficam retidos até a aprovação.
7. **Se aprovado:** Superadmin libera a conta — o subdomínio fica publicamente acessível e os anúncios já cadastrados podem ser publicados normalmente. Corretor escolhe/é atribuído a um Plano (ver 6.3) neste momento.
8. **Se reprovado:** o pré-cadastro/conta fica marcado como recusado (com motivo opcional); site permanece offline e anúncios não são liberados.

#### 6.1.2 Projeção de crescimento e gargalo operacional — nota de planejamento (não é decisão de arquitetura)

**Metas de crescimento do negócio:** 500 corretores no Ano 1, 3.000 no Ano 2, 10.000 em 5 anos.

| Marco | Corretores | Receita mensal estimada (mensalidades, mix 90% Plano 1/10% Plano 2) | Custo R2 estimado/mês | % R2 sobre receita |
|---|---|---|---|---|
| Ano 1 | 500 | R$ 25.500 | ~R$ 17 | ~0,07% |
| Ano 2 | 3.000 | R$ 153.000 | ~R$ 102 | ~0,07% |
| Ano 5 | 10.000 | R$ 510.000 | ~R$ 342 | ~0,07% |

**Conclusão:** o custo de infraestrutura (R2) permanece irrelevante (~0,07% da receita) em qualquer marco de crescimento — não é o fator limitante do negócio (ver 4.10.1 pro detalhamento do cálculo).

**⚠️ O gargalo real é operacional, não técnico:** a verificação de CRECI (passo 5 acima) é **manual**, feita pessoalmente pelo Superadmin. No ritmo de crescimento Ano 1→Ano 2 (500→3.000, ou seja, ~208 novos corretores/mês em média), a carga de verificação (~15min/verificação ≈ ~52h/mês) já ultrapassa a capacidade de uma pessoa em dedicação parcial. **Diferente da infraestrutura (que escala sozinha), a aprovação de CRECI precisa virar processo com equipe dedicada bem antes do Ano 2** — este é o ponto de atenção real do plano de crescimento, não o R2/D1/Workers.

#### 6.1.1 Campos do cadastro — imutáveis vs. editáveis — DECISÃO FECHADA

Preenchidos todos no pré-cadastro. Após o cadastro (envio do formulário), alguns campos **travam permanentemente** — só o Superadmin pode alterá-los depois (exige processo de suporte, não fica editável direto pelo corretor no painel):

**🔒 Imutáveis após o cadastro** (dados de identidade civil/profissional):

- Nome completo
- Sexo
- Data de nascimento
- Nacionalidade
- CPF
- CRECI

**✏️ Editáveis a qualquer momento pelo próprio corretor** (dados de contato):

- Endereço residencial
- Telefone
- E-mail
- WhatsApp
- (demais campos de contato/preferência que forem adicionados)

**Login e senha:**

- Usuário e senha definidos no cadastro (ver 6.2 — login aceita nome de usuário OU CPF).

### 6.2 Autenticação e senhas — DECISÃO FECHADA

- **Login = nome de usuário OU CPF (somente números, sem pontuação) + senha** — o corretor pode entrar com qualquer um dos dois identificadores. CPF é sempre válido como login (imutável, 6.1.1); nome de usuário é definido no cadastro e pode ser mais fácil de lembrar no dia a dia.
- Senhas **nunca** armazenadas em texto puro — hash via **PBKDF2 (Web Crypto API, nativo do Worker, sem dependência extra)** + salt único por usuário. Argon2id via WASM fica como upgrade futuro possível, não necessário na fase 1.
- Credenciais armazenadas no **D1** (não no KV) — motivo: KV tem consistência eventual (até ~60s de propagação, inaceitável para login logo após troca de senha) e limite de só 1.000 escritas/dia no free tier (contra 100.000 do D1); D1 também garante unicidade de e-mail (e de CPF) nativamente.
- Sessão via cookie `HttpOnly` + `Secure` + `SameSite=Strict`, validada contra registro no D1 (mais fácil de revogar que JWT).
- **Recuperação de senha:** fluxo "esqueci minha senha" envia link de redefinição (expiração curta) para o e-mail cadastrado, via **Resend**.
- E-mails transacionais (confirmação de pré-cadastro, aviso de aprovação/reprovação, recuperação de senha) via **Resend** (plano gratuito, sem necessidade de cartão de crédito, 3.000 e-mails/mês — suficiente para o volume esperado).
- 2FA obrigatório para Superadmin; opcional para corretor na fase 1.
- Proteção contra força bruta: bloqueio temporário após tentativas de login malsucedidas consecutivas.
- **Validação de CPF:** dígito verificador conferido no momento do cadastro (algoritmo padrão de CPF), além da checagem de unicidade no D1.

### 6.3 Gestão de Planos pelo Superadmin — DECISÃO FECHADA

- Múltiplos planos/níveis (tipo assinatura), não um limite global único. Cada corretor é atribuído a **um** Plano por vez.
- **CRUD completo de Planos no painel do Superadmin** (`routes/painel-superadmin.ts` + `db/queries-planos.ts`, tabela `planos` — migration `0005_planos.sql`): criar, editar, desativar planos — controlando `maxAnuncios`, `maxFotosPorAnuncio`, `taxaAdesao`, `precoMensalidade`, `permitePwa`, `permitePublicacoes`, `permiteApiGoogleMaps`.
- Seed inicial: os 5 planos de referência (ver 5.1.3) — **totalmente editáveis depois pelo Superadmin**, sem necessidade de redeploy (dado gravado no D1, não hardcoded no código).
- Corretor sem plano atribuído (ex: recém-aprovado) cai num plano padrão definido pelo sistema, até o Superadmin/o próprio corretor definir um.
- Mudança de plano tem efeito imediato sobre os limites de inclusão de anúncio/foto e sobre o acesso a PWA/Publicações (ver 6.4).
- Desativar um plano não afeta corretores já nele — apenas impede que novos sejam atribuídos a ele.

### 6.4 Regras de troca de plano — DECISÃO FECHADA

- **Adesão cobrada uma única vez**, no primeiro plano contratado pelo corretor. Trocar de plano depois (upgrade ou, se permitido, downgrade) nunca gera nova cobrança de adesão — só passa a valer a nova mensalidade a partir do próximo ciclo.
- **Downgrade bloqueado pelo sistema** se o corretor já tiver mais anúncios ativos, ou anúncios com mais fotos, do que o novo plano permitiria. Verificação feita no momento da tentativa de troca; se bloqueado, mensagem explica exatamente o que excede (ex: "Você tem 180 anúncios ativos; o Plano 1 permite até 100 — reduza antes de trocar").
  - Corretor precisa reduzir manualmente (excluir/desativar anúncios, remover fotos) até caber no novo plano antes de poder efetivar o downgrade.
- **Upgrade sempre permitido**, efeito imediato sobre os limites.
- Perda de acesso a PWA/Publicações num downgrade segue a lógica do Service Worker "suicida" (4.18) e da remoção de rota/menu (4.19) — cleanup automático, sem deixar o app instalado do visitante em estado zumbi nem rota morta no menu.

### 6.5 Promoção de Lançamento — DECISÃO FECHADA

- **Elegibilidade:** os primeiros **1.000 corretores aprovados** pelo Superadmin, contados a partir da aprovação (não do pré-cadastro) — quem excede esse número não recebe o benefício, mesmo que tenha se pré-cadastrado antes de outros.
- **Plano:** "Plano Degustação" = mesmos limites do **Plano 1** (100 anúncios, 10 fotos/anúncio, sem PWA/sem Publicações). Não é um plano à parte na tabela `planos` — é o próprio Plano 1, com isenção de cobrança aplicada no nível do Corretor.
- **Isenção:** nenhuma cobrança (nem taxa de adesão, nem mensalidade) até **01/01/2027** — **data de corte fixa**, não uma janela rolante de 6 meses por corretor. Quem entra em agosto/2026 tem ~5 meses grátis; quem entra em dezembro/2026 tem só ~1 mês. Todos os elegíveis passam a pagar a partir da mesma data.
- **Início automático de cobrança:** em 01/01/2027, cobrança começa **automaticamente**, sem ação necessária do corretor (consistente com 6.4): taxa de adesão (R$199, cobrada uma única vez nesse momento) + mensalidade do Plano 1 (R$49) passam a valer dali em diante.
- **Upgrade durante o período promocional:** se o corretor fizer upgrade de plano (ex: pro Plano 2) antes de 01/01/2027, ele sai da promoção — cobrança começa imediatamente no momento do upgrade, seguindo as regras normais de 6.4 (adesão única + mensalidade do novo plano). A promoção vale especificamente pra quem permanece no Plano 1/Degustação.
- **Campos necessários:** `promocaoLancamento` (booleano) e `dataInicioCobranca` na entidade Corretor — não é um plano novo na tabela `planos`, é uma exceção pontual de cobrança amarrada ao corretor.
- Painel do Superadmin mostra contador de vagas restantes da promoção (ex: "347/1.000 usadas").

### 6.6 Controle de Isenção de Cobrança (Free) — DECISÃO FECHADA

Mecanismo genérico e reutilizável — a Promoção de Lançamento (6.5) é apenas o primeiro caso de uso dele, não uma exceção à parte.

**Campos na entidade Corretor:**

| Campo | Tipo | Descrição |
|---|---|---|
| `isento` | booleano | Se `true`, nenhuma cobrança (adesão nem mensalidade) é gerada pro corretor |
| `isentoAte` | data, nullable | Data de corte da isenção. `null` = isenção indefinida até remoção manual |
| `motivoIsencao` | texto | Ex: "Promoção de Lançamento", "Parceria", "Cortesia" — livre, obrigatório ao conceder |

**Painel do Superadmin:** nova tela em `routes/painel-superadmin.ts` — lista de corretores com toggle de isenção, campo de data e motivo. Superadmin pode conceder, editar ou revogar isenção pra **qualquer corretor, a qualquer momento**, não só pros primeiros 1.000 da promoção. Toda alteração fica **auditada** (quem, quando, valor anterior → novo, motivo) — rastreabilidade financeira.

**Uso pela Promoção de Lançamento:** no momento da aprovação (6.1, passo 7), se o corretor for um dos primeiros 1.000, o sistema atribui automaticamente `isento=true`, `isentoAte=2027-01-01`, `motivoIsencao="Promoção de Lançamento"` — sem ação manual do Superadmin por corretor. Contador de vagas (`347/1.000 usadas`) consulta quantos corretores têm esse motivo específico.

**Reversão automática (quando o Asaas for ativado, fase 3):** Cron Trigger diário verifica corretores com `isento=true` e `isentoAte` vencida → desliga `isento` automaticamente, liberando cobrança normal a partir do próximo ciclo. Toda geração de cobrança no Asaas checa `isento` primeiro — corretor isento nunca entra na régua de cobrança.

**Migration:** campos adicionados à tabela `corretores` (migration `0002_taxonomia.sql` ou nova `0006_isencao.sql`, a definir na implementação).

---

## 7. Convenções de Código

- **Idioma no código (variáveis, funções): Português (padrão Brasil) — DECISÃO FECHADA.** Nomes de variáveis, funções, tabelas e colunas do banco em português (ex: `criarAnuncio()`, `precoVenda`, tabela `anuncios`). Diferente da convenção mais comum internacionalmente (inglês), mas escolha consciente para manter o projeto 100% legível em português do início ao fim, coerente com a UI e a documentação (`project.md`).
- **Idioma na interface (UI):** Português (PT-BR)
- **Padrão de commits: Conventional Commits — DECISÃO FECHADA.** Prefixos `feat:`, `fix:`, `docs:`, `chore:`, `refactor:` (ex: `feat: adiciona toggle de portal externo no cadastro de anúncio`).
- **Padrão de nomenclatura — DECISÃO FECHADA:**
  * Arquivos/pastas: `kebab-case` (ex: `bot-detect.ts`, `zap-exporter.ts`).
  * Funções e variáveis: `camelCase`, em português (ex: `criarAnuncio`, `precoVenda`).
  * Interfaces e Types: `PascalCase`, em português (ex: `AnuncioItem`, `CorretorPerfil`).
- **Formatação/Lint: Prettier + ESLint — DECISÃO FECHADA.** Regras padrão do TypeScript para Cloudflare Workers.
- **Tamanho máximo por arquivo: ~500 linhas — DECISÃO FECHADA.** Arquivo que se aproxima desse limite deve ser quebrado em módulos menores, cada um com responsabilidade única (ex: em vez de um `painel.ts` gigante, separar `painel/anuncios.ts`, `painel/auth.ts`, `painel/conta.ts`). Facilita revisão e permite que o Claude Code edite com precisão sem varrer arquivos grandes.

---

## 8. Glossário / Índice

| Termo               | Significado                                                                           |
| ------------------- | --------------------------------------------------------------------------------------- |
| Minisite            | Site individual do corretor em subdomínio próprio                                     |
| Rede                | Conjunto de anúncios visíveis no portal principal e compartilháveis entre domínios    |
| Postar na rede      | Toggle que define se o anúncio aparece fora do minisite do corretor                   |
| JSON de cidade      | Arquivo com todos os anúncios de uma cidade, gerado a partir do D1 e servido via R2   |
| Empréstimo de lista | Consumo do JSON de uma cidade por um domínio externo diferente do `imobiliarista.net` |
| Feed Padrão da Rede | Blog institucional mantido pela equipe `imobiliarista.net`, usado por corretores sem Blogspot próprio no módulo Publicações |

---

## 9. Layout / Sistema de Design

### 9.1 Ferramenta — DECISÃO FECHADA

**Tailwind CSS** apenas — sem Bootstrap ou outro framework CSS combinado junto (conflito de resets e especificidade, peso duplicado sem necessidade). Componentes prontos específicos (ex: datepicker, carrossel de fotos) podem usar bibliotecas pequenas e isoladas, nunca um framework CSS completo adicional.

### 9.2 Estrutura de UI (padrão "estilo Houzez") — DECISÃO FECHADA

Esqueleto funcional de telas/componentes que o portal precisa ter:

- **Home/Busca:** barra de busca de cidade em destaque (hero), com autocomplete.
- **Página da cidade:** barra de filtros avançados (tipo de negócio, tipo de imóvel, faixa de preço, quartos, banheiros, área em m²).
- **Listagem:** grid de cards (alternância lista/grade), cada card com foto principal, badge (Venda/Aluguel), preço, localização, specs rápidas (quartos/banheiros/m²), ícone de favoritar.
- **Alternância lista ↔ mapa:** ver os mesmos resultados num mapa interativo.
- **Ordenação:** dropdown (mais recentes, menor preço, maior preço, relevância).
- **Paginação** (ou scroll infinito).
- **Página do anúncio:** galeria de fotos (carrossel), preço, specs completas, descrição, localização no mapa, card do corretor responsável, botão "Fale com o corretor" (WhatsApp), anúncios semelhantes.
- **Minisite do corretor:** cabeçalho com foto/bio do corretor, grid filtrado só com os anúncios dele, contato. Menu principal inclui "Publicações" quando o módulo está ativo (4.19).
- **Breadcrumbs** em todas as páginas internas (Home > Londrina > Venda > Casa).

#### 9.2.1 Filtro avançado — base de referência

Usuário trouxe um componente HTML (busca avançada com gaveta "mais filtros") como **referência de layout e organização de campos** — sem lógica funcional real (sem JS de busca de fato, sem back-end). Pontos a corrigir ao reconstruir no padrão do projeto:

- Reescrever em **Tailwind** (o original usa CSS customizado avulso).
- Ajustar terminologia para a taxonomia fechada em 5.3 (Tipo de Negócio = Venda/Locação, categoria em 2 níveis).
- Implementar a busca de fato lendo/filtrando o JSON vindo do R2 (client-side), não como no original (função de busca inexistente).
- Manter a ideia de gaveta expansível ("mais filtros") e os campos identificados em 5.1.1.

### 9.3 Identidade visual (paleta, tipografia, personalidade) — DECISÃO FECHADA

**Referência: template Houzez (WordPress)** — linguagem visual de portal imobiliário profissional já validada no mercado (a mesma referência usada pra estrutura de UI em 9.2). Na implementação, extrair/adaptar do Houzez: paleta de cores (tons neutros de base + cor de destaque para CTAs/preço), tipografia (sans-serif limpa, hierarquia clara entre título/preço/specs), estilo de card (sombra sutil, cantos arredondados, badges de Venda/Locação). Adaptar pro Tailwind (9.1), sem copiar código-fonte do Houzez (é um produto comercial licenciado) — usar como referência visual, não como base de código.

---

## 10. Roadmap de Implementação (Lotes)

> **Status real confirmado (verificado direto no GitHub, 30 branches / 67+ commits): todos os 17 lotes do roadmap original estão implementados.** Os Lotes 1-13 já estavam em produção desde antes desta sessão de planejamento; os Lotes 14-17 (Planos expandido, PWA por plano, Publicações, Backup/Exportação de Anúncios) foram implementados nesta sessão, em cima do código existente, sem reconstrução. Próximos passos de evolução do produto (novos módulos, ajustes, features futuras) entram como Lotes 18+ conforme forem planejados.

| #  | Lote                   | Conteúdo                                                                                                                                                                                                 | Status      |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1  | Fundação               | `wrangler.toml` (bindings D1/R2/Queue + rotas www/wildcard), `package.json`, `tsconfig.json`, `tailwind.config.js`, `.gitignore`, `.env.example`, `README.md`, `src/index.ts` básico                     | 🟢 Concluído |
| 2  | Banco de dados         | Migrations `0001_init`, `0002_taxonomia`, `0003_cidades_ibge`, `0004_modulos` + `types/modelos.ts`                                                                                                       | 🟢 Concluído |
| 3  | Autenticação           | `lib/senha.ts`, `lib/cpf.ts`, `routes/api-auth*.ts` (pré-cadastro + Turnstile + aceite de termos + login + recuperação), sessão via cookie                                                               | 🟢 Concluído |
| 4  | Roteamento core        | `middleware/www-redirect.ts`, `middleware/bot-detect.ts`, `routes/portal.ts`, `routes/minisite.ts`                                                                                                       | 🟢 Concluído |
| 5  | CRUD de anúncios       | `routes/api-anuncios*.ts`, `db/queries-anuncios.ts`, `lib/slug.ts`, `lib/sanitize.ts`                                                                                                                     | 🟢 Concluído |
| 6  | Geração em lote        | `queue.ts`, `jobs/gerar-json-cidade.ts` (com particionamento), `jobs/gerar-json-corretor.ts`, `jobs/revalidacao-cruzada.ts`, `lib/r2.ts`                                                                 | 🟢 Concluído |
| 7  | Frontend base          | `public/index.html` (shell SPA), `assets/js/app*.js`, `filtros.js`, `mapa.js`                                                                                                                             | 🟢 Concluído |
| 8  | Painel do corretor     | `routes/painel-corretor.ts`, `public/painel/index.html`, `painel.js`                                                                                                                                     | 🟢 Concluído |
| 9  | Painel do superadmin   | `routes/painel-superadmin.ts` (aprovações, cidades, módulos on/off), `public/painel-admin/index.html`                                                                                                      | 🟢 Concluído |
| 10 | PWA (versão original)  | `manifest.json`, `sw.js`, `cache-buster.js` — versão universal, sem gate por plano (ver Lote 15 pra evolução com controle por plano)                                                                     | 🟢 Concluído |
| 11 | SEO                    | `routes/sitemap.ts`, `jobs/gerar-sitemap.ts`, dynamic rendering via `bot-detect.ts`                                                                                                                       | 🟢 Concluído |
| 12 | Módulos opcionais      | `src/modulos/`: 12.1 feed-grupo-olx · 12.2 feed-portais-independentes · 12.3 busca-ia · 12.4 video-youtube · 12.5 tour-360 · 12.6 busca-salva-email · 12.7 agendamento-visita · 12.8 comparacao-anuncios · 12.9 calculadora-financiamento | 🟢 Concluído |
| 13 | Backup/observabilidade | `scheduled.ts` (Cron Trigger mensal export D1→R2), `docs/observabilidade.md` (guia manual Time Travel/Rate Limiting/alertas)                                                                             | 🟢 Concluído |
| 14 | Sistema de Planos expandido | Migration `0010_planos.sql` — tabela `planos` (catálogo, 5 níveis); `corretores.plano_id`; tabela antiga renomeada pra `config_upload_corretor`; `db/queries-planos.ts`, `db/queries-isencao.ts`; CRUD no painel-superadmin (rotas dedicadas `painel-superadmin-planos.ts`/`painel-superadmin-isencao.ts`); regras de troca de plano (6.4); Promoção de Lançamento (6.5); Controle de Isenção (6.6, tabela `log_isencao`) | 🟢 Concluído |
| 15 | PWA por Plano          | Migration `0011_modulo_pwa.sql`; módulo `src/modulos/pwa/` (`logica.ts`, `gerador-manifest.ts` +2); controle duplo (flag de rede + `permite_pwa` do plano); rotas `/apps/*`; `pwa-instalador.js`; Service Worker "suicida"; arquivos estáticos antigos do Lote 10 removidos (substituídos pela geração dinâmica por corretor/plano) | 🟢 Concluído |
| 16 | Publicações            | Migration `0012_publicacoes.sql` (flag de rede) + `corretores.config_modulos` (JSON genérico, novo precedente de schema); módulo `src/modulos/publicacoes/`; painel do corretor (opt-in feed próprio/padrão); menu principal do minisite; Service Worker network-only para `/publicacoes` e domínio do Blogspot; sitemap inclui posts individuais. Pendente: `FEED_PADRAO_REDE_URL` ainda é placeholder — trocar quando o blog institucional existir | 🟢 Concluído |
| 17 | Backup/Exportação de Anúncios pelo Corretor | `src/routes/api-anuncios-backup.ts` (arquivo companheiro, `api-anuncios-crud.ts` já no limite de linhas): backup interno (schema próprio, só links R2), restauração em modo seguro (rejeita se ultrapassar limites do plano), exportação sob demanda via slug do portal (`/exportar/{slug-do-portal}`, reaproveitando `vrsync-mapper.ts`); `restaurarAnuncioComId` em `queries-anuncios.ts` | 🟢 Concluído |
| 18 | Recuperação do formulário de anúncio (PR #56) | PR #56 mesclada com sucesso em 2026-08-18, mas na branch-base errada (PR empilhada cujo base já tinha virado `main` — não chegou à história de `main`, apesar de aparecer "Merged" no GitHub). Causa raiz confirmada, isolada (checada contra as outras 29 PRs fechadas do repositório), sem force-push envolvido. Trabalho original (`00d887b0`) recuperado via cherry-pick em cima do `main` atual (PR #59): formulário de anúncio real no painel do corretor (POST/PUT/DELETE, taxonomia dependente de categoria, CEP obrigatório pro Grupo OLX, edição/exclusão via API) | 🟢 Concluído |
| — | Guardrail contra PR empilhada na base errada | `.github/workflows/guarda-pr-empilhada.yml` (PR #60, primeiro workflow do repositório) — detecta e bloqueia o padrão exato que causou a lacuna do Lote 18 | 🟢 Concluído |
| 19 | Smoke tests de integração + CI mínimo | `vitest.config.ts` + `@cloudflare/vitest-pool-workers` (roda dentro do runtime real dos Workers via Miniflare, D1/R2/Queue reais — não mocks) + `wrangler.test.toml` (config reduzida só pra teste, sem `[ai]`/rotas de produção); `test/funil-completo.test.ts` cobre pré-cadastro → aprovação → login → CRUD de anúncio → geração em lote → troca de plano → PWA → publicações → backup, travando 9 regressões já documentadas nesta seção; `eslint.config.js` (flat config, ESLint 9 — achado da sessão anterior nunca corrigido até agora); `.github/workflows/ci.yml` (typecheck com baseline de dívida técnica, lint bloqueante, smoke test bloqueante, build+dry-run do bundle) | 🟢 Concluído |
| 21 | Painel do corretor — Meu Minisite | Nova seção "Meu Minisite" no painel do corretor (`public/painel/index.html`, `public/assets/js/painel.js`): URL completa do minisite (`https://{minisite_slug}.imobiliarista.net`), badge de status ("Site no ar" vs "Aguardando aprovação", mesmo critério do badge do header) e, conforme o status, link "Visualizar meu site" (novo aba) ou texto explicando que a liberação é automática assim que o CRECI for aprovado pelo superadmin (6.1), sem prometer prazo. Só front-end: consome `minisite_slug`/`minisite_offline`, já devolvidos por `GET /api/painel-corretor/perfil`, nenhuma rota de API nova | 🟢 Concluído |
| 22 | Zerar dívida de typecheck (51 → 0) | Os 51 erros da baseline do `ci.yml` (PR #61) categorizados em 6 classes e corrigidos sem mudar comportamento: (1) `.first()`/`.all()` do D1 sem generic — 36 erros em 9 arquivos, corrigido passando o tipo via `.first<T>()`/`.all<T>()` em vez de `as X` forçado depois; (2) `request.json()` tipado `unknown` desestruturado direto — 8 erros em 2 arquivos, corrigido anotando o shape do corpo no ponto do parse; (3) `export { Tipo }` sem `export type` sob `isolatedModules` — 3 erros em 2 arquivos; (4) tipo genérico faltando em assinatura — `queue(batch: MessageBatch, ...)` → `MessageBatch<MensagemFila>` em `index.ts`, e `listagem.cursor` em `lib/r2.ts` sem checar `listagem.truncated` primeiro; (5) nulidade não normalizada (`string\|null\|undefined` → `string\|undefined`) em `api-anuncios-crud.ts`. `queries-corretores.ts` (`buscarCorrelorPorSlug`) foi um caso à parte dentro da categoria 1: a query faz JOIN com `minisites` e nunca seleciona o registro completo de `Corretor` (falta `papel`/`promocao_lancamento`/`isento`/`config_modulos`) — um bug de tipo mascarado até agora porque o TS suprime o erro de "propriedades faltando" quando já há erro de tipo em outras propriedades do mesmo literal. Corrigido estreitando o tipo de retorno pra um `Pick<Corretor, ...>` dedicado (`CorretorResumoParaMinisite`), já que os dois únicos chamadores só leem `.corretor.id` — não muda comportamento, só deixa o tipo honesto sobre o que a query de fato devolve. Único item que exigiu decisão (não mecânico): `scheduled.ts` passava `contentType` solto pro `R2Bucket.put()` do backup mensal do D1 — propriedade inválida, ignorada silenciosamente em runtime (backup ia pro R2 sem content-type real). Decisão do dono do projeto: mover pra `httpMetadata: { contentType }`, corrigindo o tipo E o comportamento (o backup passa a ter content-type de verdade no R2). Com isso, `ci.yml` teve a baseline removida — typecheck agora é bloqueante de verdade, sem tolerância | 🟢 Concluído |
| 24 | Consumers da fila resilientes a mensagem malformada | `src/queue.ts` (fila principal) e `src/queue-dlq.ts` (DLQ, Lote 23) passam a validar o formato do body (objeto com `tipo` em string) antes de despachar; corpo malformado é `ack()`ado sem retry e logado, sem interromper o resto do batch. `test/fila-mensagem-malformada.test.ts` trava a regressão | 🟢 Concluído |

---

## 11. Histórico de Decisões

| Data           | Decisão                                                                                                                                                                                                  | Motivo                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessão inicial | Repositório criado em github.com/Imobiliarista/Portal, conectado ao Cloudflare Pages/Workers                                                                                                             | Base técnica do projeto                                                                                                                                                                                  |
| Sessão inicial | Stack: Cloudflare Workers + D1 + R2, frontend HTML+JS simples                                                                                                                                            | Minimizar custo/complexidade, maximizar uso do free tier                                                                                                                                                 |
| Sessão inicial | JSON por cidade servido via R2, bypassando o Worker                                                                                                                                                      | Evitar consumo do limite mais apertado (Workers: 100K req/dia)                                                                                                                                           |
| Sessão inicial | Sistema de planos/limites incluído desde a fase 1                                                                                                                                                        | Necessidade técnica para controlar custo de storage (R2) e escrita (D1), não é feature de cobrança                                                                                                       |
| Sessão inicial | Cobrança via Asaas adiada para fase futura                                                                                                                                                               | Foco em validar o produto primeiro                                                                                                                                                                       |
| Sessão inicial | Fila de alterações em lote no painel                                                                                                                                                                     | Reduzir número de requisições individuais ao D1/R2                                                                                                                                                       |
| Sessão inicial | PWA incluída na fase 1; chat interno substituído por WhatsApp por anúncio                                                                                                                                | Baixo custo de infraestrutura, melhor experiência                                                                                                                                                        |
| Sessão inicial | Implementação via **Worker puro** (não Cloudflare Pages/Pages Functions)                                                                                                                                 | Pages não suporta subdomínio wildcard dinâmico de forma nativa e confiável                                                                                                                                |
| Sessão inicial | DNS `*.imobiliarista.net` obrigatoriamente proxied (nuvem laranja)                                                                                                                                       | Sem proxy, o Worker nunca intercepta a requisição                                                                                                                                                        |
| Sessão inicial | Regeneração do JSON de cidade desacoplada da requisição de escrita individual (via `waitUntil`/Queue)                                                                                                    | Evitar estourar o limite de CPU por invocação do Worker no plano free                                                                                                                                    |
| Sessão inicial | Rotas do Worker cobrindo domínio raiz E wildcard separadamente                                                                                                                                            | Wildcard sozinho não cobre o domínio raiz                                                                                                                                                                |
| Sessão inicial | Remoção automática de "www." (301), primeira etapa do `fetch()`                                                                                                                                          | URLs limpas e consistentes em toda a rede                                                                                                                                                                |
| Sessão inicial | Tráfego de visitante servido via Workers Static Assets (SPA), dynamic rendering só para bots                                                                                                             | Manter consumo de Workers próximo de zero, preservando SEO                                                                                                                                               |
| Sessão inicial | Fotos compactadas em WebP no navegador do corretor, duas resoluções (thumbnail + full-size)                                                                                                              | Evitar estourar CPU do Worker free e dependência do Cloudflare Images (pago)                                                                                                                             |
| Sessão inicial | Entrega dos JSONs comprimida automaticamente via Brotli da Cloudflare                                                                                                                                     | Reduzir dados consumidos pelo visitante sem complexidade extra                                                                                                                                            |
| Sessão inicial | `db.batch()`, índices no D1, sem foto original no R2, painel como Static Asset, alertas de uso                                                                                                           | Espremer ainda mais a permanência no plano free                                                                                                                                                          |
| Sessão inicial | Upgrade pago do Workers ($5/mês) aceito como rede de segurança, não como ponto de partida                                                                                                                | Crescer sem susto financeiro só quando o volume real justificar                                                                                                                                          |
| Sessão inicial | Tailwind CSS como única ferramenta de estilo                                                                                                                                                              | Evitar conflito de resets/especificidade e peso duplicado                                                                                                                                                |
| Sessão inicial | Estrutura de UI no padrão "estilo Houzez" (9.2)                                                                                                                                                           | Referência de mercado para portal de anúncios de imóveis                                                                                                                                                 |
| Sessão inicial | OpenStreetMap + Leaflet.js como mapa padrão; Google Maps API só como opção premium com chave do corretor                                                                                                 | Evitar custo/risco de cobrança do Google Maps por padrão                                                                                                                                                 |
| Sessão inicial | Geolocalização via API nativa do navegador                                                                                                                                                               | Sugerir cidade mais próxima sem custo de servidor                                                                                                                                                        |
| Sessão inicial | Módulo Asaas em sandbox desde já; cobrança real adiada para fase 3 — **decisão nunca chegou a ser implementada** (ver achado de auditoria de 2026-08-19, linha "Auditoria — Asaas" abaixo)                | Deixar a integração pronta sem gerar cobrança precoce                                                                                                                                                    |
| Sessão inicial | Incluídos na fase 1: campos personalizados/comodidades, busca salva/alerta por e-mail, agendamento de visita, comparação entre anúncios, calculadora de financiamento                                    | Aproximar do nível "Houzez" sem os módulos mais pesados                                                                                                                                                  |
| Sessão inicial | Adiados para fase 2: captura de leads + gestão de contatos (CRM-lite) e insights/analytics de desempenho                                                                                                 | Evitar processamento/armazenamento adicional na fase inicial                                                                                                                                             |
| Sessão inicial | Taxonomia de categorias fechada                                                                                                                                                                           | Base para URLs, filtros e cadastro de anúncio                                                                                                                                                            |
| Sessão inicial | Árvore de diretórios completa definida                                                                                                                                                                    | Base para os primeiros lotes de código no Claude Code                                                                                                                                                    |
| Sessão inicial | Limite de ~500 linhas por arquivo                                                                                                                                                                        | Facilitar revisão e edição precisa pelo Claude Code                                                                                                                                                      |
| Sessão inicial | JSON duplo por Cidade e por Corretor                                                                                                                                                                      | Corretor não fica limitado a uma cidade só; isolamento de visibilidade                                                                                                                                    |
| Sessão inicial | Feed XML formato VRSync por corretor, Fase 1                                                                                                                                                              | Padrão de mercado validado; custo adicional próximo de zero                                                                                                                                              |
| Sessão inicial | Toggle de portal externo nasce desligado por padrão; filtragem de cota antes do envio; contador visível                                                                                                  | Evitar estouro de cota contratada sem o corretor perceber                                                                                                                                                |
| Sessão inicial | Seletor numérico de cota por portal, nunca global                                                                                                                                                         | Cada portal tem contrato/preço próprio                                                                                                                                                                    |
| Sessão inicial | Correção: OLX/ZAP/VivaReal tratados como um único serviço (Grupo OLX)                                                                                                                                     | Schema VRSync não permite direcionar por sub-portal; nosso papel é só disponibilizar o arquivo certo                                                                                                     |
| Sessão inicial | Queue processa uma mensagem por arquivo, nunca uma mensagem única por corretor                                                                                                                           | Evitar estourar limite de CPU por invocação                                                                                                                                                              |
| Sessão inicial | Particionamento automático do JSON de cidade por tamanho comprimido (~1MB)                                                                                                                               | Simulação de mega-cidade mostrou inviabilidade de arquivo único                                                                                                                                          |
| Sessão inicial | Onboarding com pré-cadastro público + aprovação manual do Superadmin (verificação de CRECI)                                                                                                              | Rede controlada; reduz trabalho manual sem perder verificação                                                                                                                                            |
| Sessão inicial | Conta e painel liberados imediatamente no pré-cadastro; site/anúncios só após aprovação                                                                                                                  | Corretor se organiza enquanto aguarda, sem exposição pública indevida                                                                                                                                    |
| Sessão inicial | Campos imutáveis vs. editáveis no cadastro; login por usuário OU CPF                                                                                                                                      | Dados de identidade não mudam sem suporte; CPF sempre válido como login                                                                                                                                  |
| Sessão inicial | IA (Workers AI) como assistente de busca só no Portal, nunca nos minisites                                                                                                                                | No minisite o corretor já atende; no portal a IA vira "corretora virtual" da rede                                                                                                                        |
| Sessão inicial | Catálogo de cidades pré-carregado do IBGE, sem "liberação" manual                                                                                                                                         | Fonte oficial já cobre 100% dos casos; controle real é sobre o corretor (CRECI)                                                                                                                          |
| Sessão inicial | Geolocalização do visitante comparada ao catálogo IBGE no navegador                                                                                                                                       | Sem custo de servidor, sem API paga de geocoding                                                                                                                                                          |
| Sessão inicial | Vídeo YouTube via ID limpo + `youtube-nocookie.com`; CSS masking e bloqueio de anúncio descartados                                                                                                        | Parâmetros descontinuados não têm efeito; masking viola diretrizes de marca                                                                                                                              |
| Sessão inicial | Identidade visual Houzez; sistema de imobiliárias descartado definitivamente; código em Português; fila via Cloudflare Queues                                                                            | Fecham pendências abertas anteriormente                                                                                                                                                                  |
| Sessão inicial | Backup/DR do D1: Time Travel + export mensal pro R2                                                                                                                                                       | Time Travel resolve o cenário comum; export complementa retenção longa                                                                                                                                   |
| Sessão inicial | Verificação de CRECI confirmada como processo manual                                                                                                                                                      | Simplicidade na fase 1                                                                                                                                                                                    |
| Sessão inicial | 5 melhorias de fechamento pré-v1.0 (revalidação cruzada, buster de cache, URL slug+ID, sanitização, convenções de código)                                                                                | Elimina pendências abertas do documento                                                                                                                                                                  |
| Sessão inicial | `project.md` promovido de v0.2 pra v1.0 (Aprovado)                                                                                                                                                        | Base pronta para iniciar a implementação                                                                                                                                                                 |
| Sessão inicial | 5 fechamentos de SEO/segurança pós-v1.0 (sitemap em índice, HTTP 410, aceite de termos, Turnstile, rate limiting na IA)                                                                                   | Fecha lacunas que só apareceriam em produção                                                                                                                                                             |
| Sessão inicial | Árvore de diretórios revisada com sistema de módulos ativáveis/desativáveis (4.2.1)                                                                                                                       | Inspirado em plugins do WordPress, adaptado ao Workers                                                                                                                                                    |
| **Sessão de revisão** | **Correção de status (v1.1→v1.4):** roadmap da seção 10 foi revertido para 🔲 Não iniciado, por parecer que o repositório só continha `README.md` + `project.md` | Alinhamento equivocado — baseado numa leitura desatualizada do repositório (ver correção abaixo) |
| **Sessão de revisão** | **Correção da correção (v1.5):** confirmado via captura de tela do GitHub (67 commits, 30 branches) que os Lotes 1-13 **estavam de fato implementados e em produção** o tempo todo — a leitura da v1.4 foi baseada em cache desatualizado da ferramenta de busca web, não na realidade do repositório. Status revertido de volta pra 🟢 Concluído nos Lotes 1-13; as adições desta sessão (Planos expandido, PWA por plano, Publicações, backup/exportação, promoção, isenção) viram Lotes 14-17 novos, construídos em cima do código existente | Nunca confiar cegamente numa leitura de ferramenta sem confirmação visual direta quando a informação é crítica e o usuário sinaliza divergência; erro reconhecido e corrigido assim que a evidência real (captura de tela) foi apresentada |
| **Sessão de revisão** | Entidade Plano expandida: `taxaAdesao`, `precoMensalidade`, `permitePwa`, `permitePublicacoes` — múltiplos planos/níveis (não um limite global único), CRUD completo pelo Superadmin (6.3)                | Corretor precisa de opções de assinatura reais; Superadmin precisa controlar preço e limites sem redeploy                                                                                                |
| **Sessão de revisão** | 5 planos de referência definidos como seed inicial (5.1.3): 100–500 anúncios, 10–30 fotos/anúncio, adesão única de R$199 + mensalidade de R$49 a R$99; PWA/Publicações inclusos a partir do Plano 2       | Base concreta de precificação pra iniciar a implementação do sistema de Planos                                                                                                                           |
| **Sessão de revisão** | Regras de troca de plano (6.4): adesão cobrada só uma vez; downgrade bloqueado se corretor exceder os novos limites; upgrade sempre permitido, efeito imediato                                            | Evita cobrança duplicada de adesão e evita corretor ficar com anúncios/fotos além do que o novo plano permite                                                                                            |
| **Sessão de revisão** | Módulo PWA formalizado (4.18), com base em módulo de referência de outro projeto (ARQUITETURA.md): controle duplo (flag de rede + `permitePwa` do Plano), sem banner automático, rotas `/apps/*` dedicadas, rodapé, Service Worker "suicida" na desativação/downgrade, fallback de ícone, `noindex` em `/apps/*` | Padrão de UX validado em outro projeto da mesma equipe; controle duplo necessário porque PWA agora é feature diferenciada por plano, não universal                                                       |
| **Sessão de revisão** | Revisão de 4.6.1: buster de cache por timestamp restrito à casca institucional; JSONs de anúncio passam a ser **network-only**, nunca cacheados pelo Service Worker                                       | Elimina risco de anúncio desatualizado servido offline; trade-off aceito (exige conexão pra ver dado atualizado)                                                                                         |
| **Sessão de revisão** | Módulo Publicações formalizado (4.19), com base no mesmo projeto de referência: controle duplo igual ao PWA, feed próprio (Blogspot do corretor) ou Feed Padrão da Rede, path routing (`/publicacoes/{id}`), conteúdo montado 100% client-side (zero D1/R2/Worker na leitura do feed), menu principal do minisite (diferente do PWA, que fica no rodapé) | Recurso de diferenciação de planos; roteamento por path (não hash) escolhido porque nosso Worker já faz roteamento por hostname/path, sem a limitação de "Worker burro" do projeto de referência          |
| **Sessão de revisão** | Backup e exportação de anúncios pelo corretor formalizado (4.20): backup interno no nosso próprio schema (só links de fotos, nunca binário), restauração em modo seguro por padrão (não sobrescreve sem ação explícita), separado de exportação em formato de mercado (OLX/Chaves na Mão/etc.), que é via de mão única e não entra pela rota de restauração | Corretor precisa de autonomia pra proteger os próprios dados; unificar backup interno com formato de portal externo perderia campos essenciais nossos e acoplaria o D1 a decisões de terceiros            |
| **Sessão de revisão** | Confirmado por pesquisa: cada portal externo tem schema próprio e incompatível entre si — Grupo OLX aceita XML (VRSync) ou JSON proprietário (categorias/códigos próprios, formato de lista de operações); Chaves na Mão usa XML com especificação de tags totalmente própria e documentada separadamente. Nosso schema interno (D1/`modelos.ts`) permanece canônico; cada portal ganha seu próprio mapeador de saída, nunca o contrário | Evita acoplar o modelo de dados interno a decisões de fornecedores externos (a própria OLX já sinaliza uma "Fase 2" da API deles); preserva campos que só existem na nossa plataforma (corretor, Plano, módulos) |
| **Sessão de revisão** | Reforçado: geração de feed pra portal externo é sempre por corretor, nunca um arquivo único agregando a rede inteira (diferente do JSON de cidade, que é agregado) | Cada corretor tem cota (`CotaPortal`) e URL de feed próprias, cadastradas individualmente no painel de cada serviço — não há cota compartilhada entre corretores |
| **Sessão de revisão** | Gatilho de upgrade estimado (4.10.1): com ~90% dos corretores no Plano 1 e ~10% no Plano 2, o R2 free tier (10GB) esgota em torno de 48 corretores no teto máximo do próprio plano — número real provavelmente maior, já que a maioria não usa 100% do limite de fotos desde o início. R2 esgota antes do D1 (fotos pesam ordens de grandeza mais que registros de banco). Alerta de uso recomendado em ~80% do free tier | Transformar a preocupação de "vou ter que aumentar cota logo" numa estimativa concreta e acionável, em vez de uma sensação vaga; upgrade de R2 é barato e previsível (egress sempre zero) |
| **Sessão de revisão** | Projeção de custo R2 vs. receita em escala (500 no ano 1, 3.000 no ano 2, 10.000 em 5 anos): custo de R2 fica estável em ~0,07% da receita de mensalidades em qualquer marco de crescimento — confirma que R2 nunca é o gargalo financeiro do negócio | Validar a arquitetura de custo antes de comprometer recursos em otimização prematura de storage |
| **Sessão de revisão** | Identificado gargalo real de escala: **não é técnico, é operacional** — verificação manual de CRECI (6.1) por uma pessoa só estoura a capacidade já no Ano 2 (crescimento de 500→3.000 corretores), bem antes de qualquer limite de R2/D1 | Aprovação manual de CRECI não escala automaticamente como a infraestrutura; precisa virar processo com equipe dedicada, não só um checkbox no roadmap |
| **Sessão de revisão** | Promoção de Lançamento formalizada (6.5): primeiros 1.000 corretores aprovados entram no "Plano Degustação" (= limites do Plano 1) isentos de qualquer cobrança até data de corte fixa (01/01/2027, não uma janela rolante de 6 meses por corretor); cobrança automática a partir dessa data; upgrade durante a promoção encerra o benefício imediatamente | Reduzir atrito de adoção nos primeiros corretores da rede, antes de haver prova social; data fixa (em vez de contagem individual) simplifica a implementação (um campo global, não um contador por corretor) |
| **Sessão de revisão** | Controle de Isenção de Cobrança formalizado (6.6): campos genéricos `isento`/`isentoAte`/`motivoIsencao` no Corretor, gerenciáveis pelo Superadmin pra qualquer corretor a qualquer momento (não só a promoção de lançamento), com auditoria de alterações e reversão automática via Cron quando a data vence | Evitar hardcodar a promoção de lançamento como caso especial; mecanismo reutilizável pra futuras campanhas/parcerias/cortesias sem precisar de campo novo cada vez |
| **Implementação (Lote 14)** | Claude Code implementou o Sistema de Planos e encontrou colisão real de schema: a tabela `planos` já existia (1 linha por corretor, sem preço/mensalidade). Resolvido renomeando a tabela antiga pra `config_upload_corretor` (mantendo só `max_resolucao_upload_bytes`/`google_maps_api_key`, que são config por corretor, não do catálogo) e criando `planos` do zero como catálogo compartilhado. Tabela `log_isencao` criada pra auditoria de 6.6. Registrado em 5.1.4 | Documentar decisão de implementação não prevista no planejamento original, mantendo o project.md sincronizado com o schema real |
| **Implementação (Lote 17)** | **Bug crítico descoberto e corrigido:** o roteador de anúncios (`rotasAnuncios`/`api-anuncios.ts`, Lote 5) nunca havia sido conectado em `src/index.ts` — todo o CRUD de anúncios via API estava inacessível via HTTP desde o merge original do Lote 5, silenciosamente, sem nenhum teste ter pego isso. Corrigido junto com o Lote 17 (adicionada a delegação faltante), já que os novos endpoints de backup dependiam da mesma base de rotas | Risco real de produção não detectado por falta de CI/testes automatizados no projeto — reforça a necessidade de, em algum momento, adicionar testes de integração básicos (smoke tests) cobrindo pelo menos o roteamento principal |
| **Implementação (Lote 17)** | Rotas de exportação em formato de mercado usam o **slug do portal** como identificador (`/api/anuncios/exportar/{slug-do-portal}`, ex: `grupo-olx`, ou qualquer slug já cadastrado em `portais_independentes`), não sufixos fixos tipo `-json`/`-xml` como o texto ilustrativo da seção 4.20 sugeria — decisão tomada porque mapeadores proprietários por portal além do Grupo OLX ainda não existem (marcados como "futuramente" na seção 4.11); o slug genérico evita reescrever a rota quando novos mapeadores forem adicionados | Manter a rota estável conforme novos portais forem integrados, sem exigir mudança de contrato de API a cada novo mapeador |
| **Auditoria pós-Lote 17** | **Bug crítico descoberto e corrigido:** `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (7 linhas, em `0005_autenticacao.sql`, `0006_superadmin.sql` e `0010_planos.sql`) não é sintaxe válida em SQLite/D1 — `IF NOT EXISTS` só existe pra `CREATE TABLE`/`CREATE INDEX`, nunca pra `ADD COLUMN`. Isso quebrava a cadeia de migrations inteira a partir da 0005 num D1 novo (`wrangler d1 migrations apply --local` falhava com `SQLITE_ERROR` antes mesmo do seed dos planos em 0010 rodar). Corrigido removendo `IF NOT EXISTS` das 7 linhas; confirmado que as 12 migrations existentes voltam a aplicar em ordem, do zero, sem erro | Mesma classe de risco do bug do Lote 17 (roteador nunca conectado): defeito presente desde a migration original, nunca pego por falta de um teste de "aplicar migrations do zero" — reforça a necessidade de smoke test cobrindo isso |
| **Auditoria pós-Lote 17** | `corretores.plano_id` (criado em 0010, migration já commitada) não tinha `FOREIGN KEY`, então um `plano_id` órfão/inválido não era barrado pelo banco. Como SQLite não suporta `ALTER TABLE ... ADD CONSTRAINT`, a correção foi uma migration nova (`0013_fk_corretores_plano.sql`) que recria `corretores` (padrão "12 passos" do próprio SQLite) preservando todas as colunas/índices e adicionando `FOREIGN KEY (plano_id) REFERENCES planos(id)`. Confirmado por teste que a FK é reforçada pelo D1 por padrão (sem precisar de `PRAGMA` explícito no código) | Não editar uma migration já commitada/aplicada em produção; corrigir schema existente sempre via migration nova |
| **Auditoria pós-Lote 17** | **Decisão de limpeza do R2 pra feeds desativados:** `rotaFeedGrupoOLX`/`rotaFeedPortalIndependente` só checavam a flag de módulo/cota na **geração** do XML (`processarGerarXMLGrupoOLX`/`processarGerarFeedPortalIndependente`), nunca na rota que **serve** o arquivo — um módulo ou cota desativado não tinha efeito nenhum sobre o XML já gravado no R2, que continuava sendo servido publicamente. Adicionada checagem viva (`estaModuloAtivo` + `cota.ativo`) nas duas rotas, retornando 404 quando módulo/cota não estão ativos. Optou-se por **não deletar o objeto do R2** no ato da desativação — não existe um hook único de desativação (módulo é toggle do Superadmin, cota é toggle separado por corretor/portal), e o live-gate a cada requisição protege mesmo que algo volte a escrever no R2 depois, sem precisar de reconciliação em lote como o PWA usa (`sincronizarArtefatosPwaDoCorretor`). O arquivo antigo fica esquecido no bucket, mas nunca mais é servido | Mesma classe de risco do bug do Lote 17: checagem de flag existente só num lugar do fluxo (geração), ausente no outro (serving) — corrigido seguindo o padrão já usado em Publicações/PWA (checagem em tempo de request) |
| **Auditoria pós-Lote 17** | `calculadora-financiamento/rota.ts` e `comparacao-anuncios/rota.ts` são bibliotecas de cálculo 100% client-side, sem rota HTTP própria — não têm "servir" no sentido de request ao Worker. O JS desses widgets (e de `busca-salva-email.js`) já esperava um sinal `data-modulos-ativos` no `<html>`, mas nenhuma rota jamais escrevia esse atributo; na prática os widgets nunca respeitavam a flag de rede. Decisão (consistente com o padrão de PWA/Publicações, seção 4.18/4.19): a checagem acontece na **geração em lote**, não em tempo de requisição — `jobs/gerar-json-corretor.ts` agora inclui `modulosAtivos: { calculadoraFinanceira, comparacaoAnuncios }` em `corretores/{slug}.json` (mesmo `estaModuloAtivo`, seção 4.2.1). `app-dados.js` guarda esse campo em `appState.modulosAtivos`; os dois widgets passam a ler dali em vez do atributo HTML morto. Deliberadamente **não** foi tocado `routes/portal.ts`/`routes/minisite.ts` — eles servem o shell da SPA via Workers Static Assets (seção 4.6) e não devem processar nada por visita humana. Na ausência do campo (ex: página de listagem por cidade antes da extensão abaixo), o fallback de desenvolvimento (query param/sessionStorage) some silenciosamente em produção — os widgets ficam **escondidos por padrão** (fecha fechado, nunca aparece indevidamente) | Reaproveitar o mecanismo de controle por flag de rede já validado em PWA/Publicações em vez de inventar um novo (endpoint dedicado ou atributo HTML dinâmico), respeitando a arquitetura de custo fechada (Workers Static Assets, sem processamento por visita) |
| **Auditoria pós-Lote 17** | Padrão de `modulosAtivos` estendido pra `jobs/gerar-json-cidade.ts`: o campo passa a existir também em `cidades/{slug}/_index.json` (nos 3 ramos do job — cidade sem anúncios, arquivo único, particionado por bairro), lido por `fetchCityListings` (`app-dados.js`) em `appState.modulosAtivos`, fechando a lacuna residual das páginas de listagem por cidade citada acima. Diferente de `gerar-json-corretor.ts`, aqui a flag reflete **só a configuração de rede** (`estaModuloAtivo`, sem checagem de plano) — o JSON de cidade é agregado entre vários corretores (4.4.1), não haveria como aplicar um plano único dentro de um arquivo que mistura anúncios de corretores diferentes; como nenhum dos dois módulos tem controle por plano (diferente de PWA/Publicações), o critério bate com o já usado em `gerar-json-corretor.ts` de qualquer forma. Campo colocado no índice (não nos arquivos de listagem/partição) pra ficar disponível num único lugar, sempre buscado primeiro, independente de a cidade estar vazia ou particionada | Consistência com o padrão já adotado; índice é o único ponto do fluxo de fetch garantidamente buscado antes de qualquer decisão de particionamento |
| **Auditoria de fluxo completo (teste ponta a ponta)** | Simulação manual do fluxo completo do corretor (pré-cadastro → login → aprovação → anúncio → limites → geração em lote → troca de plano → PWA → publicações → backup → downgrade) via `wrangler dev` local com D1 zerado revelou que **nenhuma etapa do onboarding funcionava de ponta a ponta**: `handlePreCadastro` nunca coletava `cpf`/`nome_usuario`/`sexo`/`data_nascimento`/`nacionalidade`/`endereco_residencial` (seção 6.1.1), quebrando com `SQLITE_CONSTRAINT` em `corretores.cpf` (`NOT NULL UNIQUE`) toda vez; `handleLogin` devolvia um cookie de sessão que nunca era persistido em `sessoes`, então nenhuma rota autenticada funcionava mesmo após um "login bem-sucedido"; `aprovarPreCadastro` criava um corretor **duplicado** na aprovação (com credenciais vazias) em vez de promover a conta já existente — e também quebrava com o mesmo `SQLITE_CONSTRAINT` de `cpf`; o roteador de `/api/anuncios` (`rotasAnuncios`) tinha um `if` sem checagem de método HTTP que interceptava qualquer POST (criar anúncio) e mandava pro handler de listagem (só GET), retornando 404 sempre. Todos os quatro corrigidos nesta sessão: coleta completa de campos + checagens de unicidade amigáveis no pré-cadastro; persistência real de sessão no login + correção da checagem morta de `GET /api/auth/sessao` (sempre retornava `{autenticado:false}`) + revogação de sessão real no logout; nova coluna `pre_cadastros.corretor_id` (migration `0014`) pra vincular as duas tabelas (não havia FK nenhuma antes — só o e-mail repetido, chave insegura porque é editável) e `aprovarPreCadastro` reescrito pra fazer `UPDATE` no corretor certo preservando `senha_hash`/`senha_salt`; checagem de método adicionada no roteador de anúncios | Confirma o padrão já identificado no Lote 17/auditoria pós-Lote 17: bugs de "caminho nunca exercitado" (rota nunca conectada, campo nunca persistido, checagem sempre falsa) só aparecem simulando o fluxo real ponta a ponta, não em revisão de código isolada por arquivo — reforça, pela terceira vez, a necessidade de smoke tests de integração cobrindo o funil completo do corretor |
| **Auditoria de fluxo completo (teste ponta a ponta)** | Dois bugs adicionais encontrados na mesma simulação: (1) `atualizarAnuncio` tinha uma whitelist de campos editáveis sem `"slug"`, então a correção pós-criação do slug provisório (`"-0"` → `"-{id}"`, ver `handleCriarAnuncio`) nunca tinha efeito — todo anúncio novo ficava com URL amigável quebrada (seção 4.14); corrigido incluindo `"slug"` na whitelist (seguro porque `handleEditarAnuncio` nunca repassa `slug` do corpo da requisição do cliente). (2) `revalidacao-cruzada.ts` montava a mensagem `gerar-json-cidade` só com `cidade_slug`, mas `gerar-json-cidade.ts` precisa de `cidade_id` pra consultar os anúncios (`WHERE a.cidade_id = ?`) — todo toggle de `postar_na_rede`/exclusão de anúncio disparava `D1_TYPE_ERROR` e o `cidade.json` nunca era atualizado; corrigido propagando `cidade_id` por toda a cadeia (5 pontos de chamada). Aproveitado pra adicionar `max_retries`/`dead_letter_queue` no consumer da Queue (`wrangler.toml`) — sem isso, uma mensagem que nunca processa (como esse caso, antes do fix) retentaria pra sempre, consumindo cota à toa (seção 4.9/4.10); ~~a fila `imob-queue-dlq` precisa ser criada (`wrangler queues create`) antes do próximo deploy~~ — desatualizado, nunca corrigido na tabela na hora. Confirmado pelo dono do projeto direto no painel Cloudflare em 2026-08-19 que a fila `imob-queue-dlq` já existe há muito tempo. Entrada mantida como registro histórico do achado original; a pendência de criação está eliminada. ~~**Pendência real, diferente da de criação:** nenhum consumer está vinculado à `imob-queue-dlq` — mensagens que caem lá não são processadas nem geram alerta automático, ficam só acumulando até checagem manual no painel~~ — **resolvida no Lote 23** (consumer + alerta por e-mail, ver linha própria abaixo) | Mesma classe de risco: um campo omitido silenciosamente numa whitelist ou numa mensagem de fila não quebra a compilação nem os testes unitários de cada arquivo isolado — só aparece rodando o fluxo real |
| **Auditoria de fluxo completo (teste ponta a ponta)** | `trocarPlanoDoCorretor` decidia "é downgrade?" comparando `preco_mensalidade` entre plano atual e novo (seção 6.4) — mas como `maxAnuncios`/`maxFotosPorAnuncio`/preço são campos independentes e todos editáveis pelo Superadmin (seção 6.3), um plano **mais caro com limites menores** passava pela troca sem checagem nenhuma (preço maior = "não é downgrade"), permitindo o corretor ficar com mais anúncios/fotos do que o plano contratado permite — violação direta da regra de 6.4. Corrigido comparando `max_anuncios`/`max_fotos_por_anuncio` diretamente; confirmado nos dois sentidos com planos de teste (plano mais caro com limite menor agora bloqueia corretamente; plano mais barato com limite maior continua liberado sem checagem desnecessária) | Preço e limites de uso são dimensões independentes do Plano — a regra de proteção de 6.4 existe pra proteger os limites de uso, não o faturamento; usar preço como proxy pra "downgrade" quebra assim que as duas dimensões divergem |
| **Auditoria de fluxo completo (teste ponta a ponta)** | ~~Verificado, não corrigido: a URL de validação do Turnstile em `validarTurnstile` (`src/routes/api-auth-cadastro.ts`) é `https://challenges.cloudflare.com/turnstile/validate`~~ — **corrigido em sessão posterior, não documentado na hora.** Confirmado em auditoria de 2026-08-19 que `src/routes/api-auth-cadastro.ts` já usa o endpoint correto (`https://challenges.cloudflare.com/turnstile/v0/siteverify`). Entrada mantida como registro histórico do achado original; risco já eliminado | Documentar o achado pra não se perder antes da próxima sessão de correção; a fonte (docs oficiais da Cloudflare, não memória do modelo) está registrada pra auditoria |
| **Correção pós-auditoria de fluxo completo** | **Mudança de arquitetura — DECISÃO FECHADA:** uma nova auditoria (desta vez checando o *corpo* da resposta, não só o status HTTP) descobriu que `/painel/*` e `/painel-admin/*` interceptavam **toda** requisição — inclusive o próprio HTML do shell — no roteador de API correspondente (`rotasPainelCorretor`/`rotasPainelSuperadmin`), que exige sessão e só reconhece sub-rotas específicas (`/painel/perfil`, etc.). Resultado: `public/painel/index.html` e o então `public/painel/superadmin.html` **nunca eram servidos**, com ou sem sessão válida — corretor e superadmin não conseguiam abrir o painel no navegador em nenhuma circunstância, apesar de toda a lógica de API por trás funcionar normalmente quando chamada diretamente. Corrigido separando definitivamente prefixo de API e prefixo de shell estático: API do corretor movida pra `/api/painel-corretor/*`, API do superadmin pra `/api/painel-admin/*`; `/painel/*` e `/painel-admin/*` ficam livres pra `env.ASSETS.fetch` (mesmo padrão de `routes/portal.ts`/`routes/minisite.ts`, seção 4.6/4.9). `public/painel/superadmin.html` foi movido pra `public/painel-admin/index.html`, alinhando o shell do superadmin ao seu próprio prefixo em vez de colidir com o prefixo do corretor. Seções 4.2 e 4.9 atualizadas pra registrar os novos prefixos como convenção permanente | Confirma, pela quarta vez, o padrão já registrado nas auditorias anteriores (Lote 17, pós-Lote 17, fluxo completo): bugs de "caminho nunca exercitado" só aparecem rodando o fluxo real — neste caso, especificamente, só aparecem quando o teste verifica o *corpo* da resposta (HTML esperado) em vez de só o status HTTP, já que tanto o `401` quanto o `404` retornados pelo roteador de API "pareciam" respostas razoáveis à primeira vista. API e shell estático precisam de prefixos disjuntos por princípio — reutilizar o mesmo prefixo pra API de escrita/leitura e pro HTML servido ao navegador é uma armadilha estrutural que volta a se repetir se não virar convenção explícita no documento (agora registrada em 4.9) |
| **Correção pós-auditoria de fluxo completo** | Dois gaps do tipo "checagem só em parte do fluxo" fechados na mesma sessão: (1) `api-anuncios-crud.ts` só enfileirava `revalidacao-cruzada` em criar/excluir/alternar "postar na rede"/marcar vendido — uma edição comum (preço, descrição, fotos, quartos, banheiros, área, bairro etc.) não disparava nada, deixando `corretor.json`/`cidade.json` desatualizados no R2 indefinidamente até algum evento não relacionado do mesmo corretor disparar a regeneração por acaso. Corrigido enfileirando também no branch de edição comum, sempre que algum campo foi de fato alterado; consolidada em `jobs/revalidacao-cruzada.ts::enfileirarRevalidacaoDoAnuncio` a lógica de resolver slug do minisite + slug da cidade e disparar a fila, antes duplicada quase idêntica em 5 pontos (`api-anuncios-crud.ts` ×4, `api-anuncios-backup.ts` ×1). (2) `responderManifest`/`responderServiceWorker` (`modulos/pwa/rota.ts`) serviam cegamente o artefato cacheado no R2 do minisite sem checar a elegibilidade atual do corretor — um corretor rebaixado pra um plano sem `permite_pwa` continuava com o app instalável disponível até algum evento não relacionado regenerar o R2 e limpar o artefato. Corrigido adicionando, antes de servir o R2, a mesma checagem ao vivo (`verificarElegibilidadePwa`) já usada em `/apps/*`: 404 imediato se não elegível, sem apagar o artefato do R2 (a limpeza continua a cargo da próxima regeneração em lote) | Mesma classe de risco já documentada nas auditorias anteriores (pós-Lote 17: feeds externos e módulos client-side tinham o mesmo padrão de "checagem só na geração, nunca no serving") — reforça que o padrão correto (checagem ao vivo antes de servir conteúdo cacheado condicionado a plano/módulo, nunca depender de uma regeneração em lote acontecer por coincidência) precisa ser aplicado sistematicamente, não só nos pontos já corrigidos antes |
| **Auditoria de segurança — painéis sem gate no HTML** | A separação de prefixo API/shell da correção anterior resolveu o "painel nunca abre", mas trocou o bug por outro: `/painel/*` e `/painel-admin/*` passaram a cair direto em `env.ASSETS.fetch`, sem checagem de sessão nenhuma — confirmado ao vivo com `wrangler dev` local (D1 seedado): `GET /painel/` e `GET /painel-admin/` sem cookie devolviam HTML 200 completo do dashboard. A API por trás continuava protegida (nenhum dado vazava, só a estrutura/UI), mas qualquer visitante via a interface inteira do superadmin | Confirma a mesma classe de risco pela quinta vez: a checagem em `/api/painel-*` cobria só a API, nunca o HTML — API e shell estático protegidos separadamente é uma armadilha que se repete se a checagem de sessão não virar parte do roteamento em si, não um detalhe de cada endpoint |
| **Reconstrução do feed VRSync (Grupo OLX)** | **Achado raiz:** o schema XML gerado desde o Lote 12.1 (`<Property>`/`<Title>`/`<TransactionType>`, valores em inglês) nunca correspondeu à especificação real de nenhum portal — fictício desde a implementação original, nunca pego porque nada testava o *conteúdo* do XML contra uma spec real. Substituído pelas tags reais em `lib/feeds/formatadores/vrsync-olx.ts` (ver seção 4.11). **Três achados adicionais durante a correção, mesma classe "caminho nunca exercitado" já registrada várias vezes nesta tabela:** (1) nenhum ponto do código jamais disparava a geração do feed — `jobs/revalidacao-cruzada.ts` nunca enfileirava, e a função pronta pra isso (`dispararGeracaoXMLGrupoOLX`) nunca era chamada; corrigido, função morta removida. (2) o campo `priorizado`, usado na lógica de seleção por cota, nunca esteve ligado a coluna nenhuma do banco — sempre `undefined`; substituído pelo toggle real `publicar_grupo_olx` (migration 0015), que também passa a exigir CEP (coluna nova, mesma migration). (3) `dados.portal_externo`, usado pra decidir se a validação de campos obrigatórios rodava em `api-anuncios-crud.ts`, nunca era enviado por nenhum formulário — também código morto; trocado pelo `publicar_grupo_olx` real. Fusão de `feed-grupo-olx` em `portais_independentes` (migration 0016) eliminou ~370 linhas de módulo duplicado. **Pendência registrada, não corrigida:** o formulário de cadastro de anúncio no painel do corretor (`painel.js::enviarFormAnuncio`) é um placeholder que nunca chama a API real — front-end funcional pro checkbox/CEP fica de fora desta correção | Backend (migrations, validação, geração, disparo, fusão de módulo) testado localmente via D1 local + typecheck + bundle dry-run + script standalone confirmando o XML gerado e a sanitização; front-end do formulário de anúncio permanece nunca-testado-porque-nunca-existiu, decisão explícita de não expandir o escopo desta correção sem aprovação separada |
| **Correção — login real + redirecionamento por sessão** | Fecha o achado acima. Login de verdade em `public/login/index.html` (raiz e subdomínio do corretor, mesmo arquivo) chamando `POST /api/auth/login` (já existia, nunca era chamado por lugar nenhum do front — não havia formulário de login em todo o repositório antes desta correção). Gate de sessão adicionado ANTES de `env.ASSETS.fetch`: `routes/painel-gate.ts` (raiz) e o trecho equivalente em `routes/minisite.ts` (subdomínio, checando posse via `status.corretor_id` do R2, não só "sessão válida de algum corretor"). Decisão de destino centralizada em `lib/sessao-destino.ts` (`calcularDestinoPosLogin`), única fonte de verdade usada por login, `/api/auth/sessao` (pra pular o formulário se já autenticado) e os dois gates — superadmin sempre `/painel-admin/` na raiz; corretor com minisite liberado sempre no próprio subdomínio (`{slug}.imobiliarista.net/painel/`), **independente de onde logou**; corretor sem minisite liberado (pré-cadastro/pendente) fica na raiz, reaproveitando o mesmo shell de `public/painel/index.html` — não existe hoje uma tela dedicada de "criar/configurar minisite" além do badge "Site offline — Aguardando aprovação" já presente ali, e nenhuma foi inventada nesta correção. Pré-requisito não óbvio: o cookie de sessão passou a ser emitido com `Domain=imobiliarista.net` explícito (era host-only) — sem isso, logar na raiz e ser redirecionado pro subdomínio do corretor chegaria lá sem cookie nenhum. `logout()` de `painel.js`/`painel-superadmin.js` também corrigido: só limpava um cookie `HttpOnly` via JS client-side (não fazia nada de fato) — agora chama `POST /api/auth/logout`. Validado com harness que chama o `fetch()` real do Worker com Request/env construídos à mão (D1 real via `node:sqlite` + migrations, R2/ASSETS stubados) — `wrangler dev` local não respeita `Host` customizado (confirmado experimentalmente: qualquer valor enviado resolve pro mesmo hostname interno), tornando impossível simular raiz vs. subdomínio via HTTP local direto; 20 cenários cobertos (superadmin auth/não, corretor liberado logando pelos dois hosts, corretor pendente, acesso cross-tenant a subdomínio de outro corretor, `/painel-admin/` em subdomínio) | Proteger o roteamento (gate antes do `ASSETS.fetch`), não os endpoints isolados, é a lição que faltava nas duas correções anteriores desta mesma área; centralizar "pra onde vai depois de logar" numa função só evita raiz e subdomínio divergirem conforme o produto crescer |
| **Incidente — PR #56 (formulário de anúncio) mesclada e perdida** | Fecha a pendência registrada na linha da Reconstrução do feed VRSync, acima. A PR #56 (`fix(painel): conecta o formulário de anúncio ao backend real` — implementava exatamente essa pendência) foi mesclada com sucesso em 2026-08-18T13:02:05Z, mas **na branch-base errada**: era uma PR empilhada sobre a branch da PR #55 (não `main`), com a própria descrição pedindo explicitamente "Não mesclar ainda". A PR #55 já tinha sido mesclada em `main` 20 segundos antes; ninguém retargetou a base da #56 pra `main` depois disso, e ela foi mesclada na branch-base já obsoleta. Resultado: o trabalho da #56 nunca chegou a `main`, apesar de aparecer como "Merged" no GitHub — a PR #57 (aberta 13 minutos depois) partiu direto de `main` sem nenhum rastro da #56, e a PR #58 (correção de cascata de erro no mesmo arquivo) foi construída em cima desse estado sem o formulário real. **Causa raiz confirmada, não é force-push:** histórico de `main` é linear (`git merge-base --is-ancestor` + inspeção de parents de cada merge commit, sem SHA reescrito); checado contra as outras 29 PRs fechadas do repositório (#29-#58) — a #56 é o único caso com base diferente de `main`, incidente isolado. A branch de origem (`claude/formulario-anuncio-painel-corretor`) permaneceu íntegra no origin. **Recuperação (PR #59):** cherry-pick do commit original (`00d887b0`) em cima do `main` atual (já com a #58); um único conflito, isolado no construtor de `painel.js` (as duas PRs adicionaram campos novos em paralelo), resolvido mantendo os campos de ambas. `npm run typecheck`: 51 erros, mesma baseline do `main` puro (confirmado comparando as duas árvores via `git worktree`), zero novos. Smoke test end-to-end real contra `wrangler dev --local` + D1 local seedado (migrations 0001-0016 aplicadas do zero sem erro): login, `GET taxonomia`, criação bloqueada corretamente sem CEP quando `publicar_grupo_olx=true`, criação/edição/exclusão (soft-delete) via API real, confirmando que a integração da #56 e o isolamento de erro da #58 convivem sem conflito | Mesma classe de risco "caminho nunca exercitado" já registrada várias vezes nesta tabela, mas numa camada diferente: não foi um bug de código não exercitado, foi um bug de *processo de merge* não exercitado — PR empilhada é um padrão raro o suficiente no histórico do repositório (1 em 30) pra não ter sido pego por revisão manual na hora. Reforça a mesma lição de sempre: só aparece rodando/checando o fluxo real (aqui, o fluxo de merge), não olhando o diff isolado |
| **Guardrail — PR #60, primeiro workflow de CI do repositório** | Fecha o incidente acima com um mecanismo de prevenção, não só a recuperação pontual. `.github/workflows/guarda-pr-empilhada.yml`: job `verificar-pr-aberta` (trigger `pull_request`) bloqueia a abertura/atualização de qualquer PR cuja base não seja `main` quando essa base já foi mesclada em `main` (via `git merge-base --is-ancestor`); job `revalidar-prs-abertas` (trigger `push` em `main`) fecha a lacuna que o primeiro job sozinho não cobre — a #56 passou pelo equivalente do primeiro job quando foi aberta (sua base ainda não tinha mesclado) e nunca recebeu um push novo depois que a base mergeou, então nada teria disparado o job de novo antes do merge; o segundo job revarre PRs empilhadas abertas a cada push em `main` e comenta/falha se alguma base virou ancestral nesse meio tempo. Validado sem criar PRs de mentira no repositório real: rodando a mesma lógica de shell contra os SHAs reais do incidente (bloqueia corretamente o caso histórico da #56, não bloqueia uma PR empilhada legítima em andamento) | Não bastava recuperar o trabalho perdido — sem um guardrail, o mesmo padrão (PR empilhada + base mergeada por fora) volta a acontecer da próxima vez que alguém empilhar uma PR. Preferido a um processo manual ("sempre lembrar de retargetar") porque checagem automática não depende de disciplina humana se repetir |
| **Lote 19 — Infraestrutura de teste e CI** | Repositório não tinha nenhum test runner nem CI de conteúdo de código (só o guardrail de processo da PR #60) — os seis achados de "caminho nunca exercitado" registrados nesta tabela (Lote 17, pós-Lote 17, auditoria de fluxo completo ×4, correções pós-auditoria ×2, painéis sem gate, feed VRSync, PR #56) só foram pegos simulando manualmente o fluxo real, nunca em automação. `vitest` + `@cloudflare/vitest-pool-workers` (roda dentro do runtime real dos Workers via Miniflare — D1/R2/Queue reais, não mocks); `wrangler.test.toml` dedicado (sem `[ai]` — Workers AI não tem emulação local no pool de testes, exigiria `CLOUDFLARE_API_TOKEN` pra sessão remota, o que quebraria o CI; sem `[[routes]]`/`[triggers]`, conceitos só de produção). `test/funil-completo.test.ts` (10 testes) cobre pré-cadastro (rejeita campo faltante de 6.1.1 sem tentar o INSERT) → aprovação (promove via `pre_cadastros.corretor_id`, nunca duplica) → login (`session_id` persistido em `sessoes` de verdade, `GET /api/auth/sessao` confirma) → CRUD de anúncio (bloqueio de CEP, slug provisório→final) → geração em lote (mensagem de revalidação leva `cidade_id`, JSONs de cidade/corretor refletidos no R2) → troca de plano (downgrade bloqueado por `max_fotos_por_anuncio`, não por preço) → PWA (checagem viva nega `/manifest.json`/`/sw.js` após downgrade mesmo com artefato antigo no R2) → publicações (feed próprio vs. Feed Padrão da Rede refletidos no JSON do corretor) → backup (restauração rejeita acima do limite do plano atual, aceita dentro dele) — cada bloco trava uma regressão já documentada nesta seção, não hipotética. Decisão deliberada de não mockar a chamada de rede do Turnstile (`fetchMock` foi removido desta versão do pool em favor de `@msw/cloudflare`, ainda em 0.0.x, imaturo demais pra depender aqui): o item de pré-cadastro testa só a validação de campos (que falha antes do Turnstile) contra o endpoint HTTP real; os fixtures de corretor pra aprovação em diante usam inserts diretos em D1 espelhando exatamente os INSERTs de `handlePreCadastro`. `eslint.config.js` (flat config, ESLint 9) criado do zero — achado da sessão anterior (`npm run lint` falhava por config ausente) nunca corrigido até agora; `@typescript-eslint/no-explicit-any` desligado (uso deliberado e disseminado no código existente, travar retroativamente exigiria tipar dezenas de pontos fora do escopo do Lote 19), mas ~9 problemas reais e baratos de corrigir (2 imports/consts mortos, 1 `let`→`const`, 5 escapes de regex inúteis, 1 regex de controle marcada como intencional via comentário) foram corrigidos em vez de suprimidos — `npm run lint` sai limpo (exit 0), tornando o gate do CI bloqueante de verdade, não decorativo. `.github/workflows/ci.yml` roda em todo PR contra `main`: typecheck com baseline versionada (`BASELINE_TYPECHECK_ERRORS=51`, confirmada rodando `tsc --noEmit` no `main` puro — falha só acima disso, nunca exatamente nela), lint bloqueante, o smoke test acima bloqueante, `build:css` + `wrangler deploy --dry-run` pra pegar erro de bundle antes de produção | O próprio padrão "caminho nunca exercitado" que motivou o Lote 19 é a prova de que revisão de código isolada por arquivo não basta — só automação rodando o fluxo real a cada PR fecha essa lacuna de forma duradoura, em vez de depender da próxima auditoria manual encontrar o próximo bug da mesma classe |
| **Lote 22 — Dívida de typecheck zerada** | Os 51 erros da baseline do `ci.yml` (versionada desde a PR #61) categorizados em 6 classes antes de qualquer correção (ver seção 10, linha do Lote 22, para a lista completa por arquivo) e corrigidos sem alterar comportamento, exceto um caso deliberado. A maior classe, de longe (36/51): `db.prepare(...).first()`/`.all()` do D1 retorna `Record<string, unknown>` por padrão, e o código em `queries-*.ts` fazia `as Plano[]`/`as Cidade`/etc. no retorno — o TS recusa porque `Record<string, unknown>` não tem overlap estrutural suficiente com os tipos de domínio. Corrigido usando o generic que o D1 já suporta (`.first<Plano>()`, `.all<Cidade>()`) em vez de castar depois — mesmo dado em runtime, resolve o tipo na origem. Achado incidental nessa correção: `queries-corretores.ts::buscarCorrelorPorSlug` monta um objeto `Corretor` completo a partir de uma query que faz JOIN com `minisites` e nunca seleciona `papel`/`promocao_lancamento`/`isento`/`config_modulos` — um retorno de tipo incorreto que o `tsc` não acusava porque, quando um literal de objeto já tem erro de atribuição em alguma propriedade, o compilador suprime o erro separado de "propriedades obrigatórias faltando" no mesmo literal (confirmado isolando o comportamento num repro mínimo). Corrigido estreitando o retorno pra um tipo `Pick<Corretor, ...>` dedicado (`CorretorResumoParaMinisite`) — os dois únicos chamadores (`gerar-json-corretor.ts`, `feed-portais-independentes/gerador.ts`) só leem `.corretor.id`, então a mudança de assinatura não quebra nada; o tipo agora só promete o que a query de fato devolve. Único item que exigiu decisão do dono do projeto (não mecânico, por alterar comportamento de runtime): `scheduled.ts` passava `contentType` solto pras `options` do `R2Bucket.put()` no backup mensal do D1 — propriedade que não existe em `R2PutOptions` (a real é `httpMetadata.contentType`), ignorada silenciosamente há quem sabe quanto tempo; o backup ia pro R2 sem content-type nenhum de fato setado. Decisão: mover pra `httpMetadata: { contentType }`, que corrige o tipo E passa a setar o content-type real do objeto no R2 (antes não setava nada). Com os 51 → 0, `.github/workflows/ci.yml` teve `BASELINE_TYPECHECK_ERRORS` removida — o job de typecheck agora falha em qualquer erro, sem tolerância. Validado a cada lote de correção: `tsc --noEmit` decrescente + `test/funil-completo.test.ts` (10/10) sem quebrar; ao final, também `npm run lint` (exit 0) e `build:css && wrangler deploy --dry-run` limpos | O mesmo "caminho nunca exercitado" de sempre, numa camada nova: um `as X` forçado no retorno de uma query esconde tanto erro de tipo comum (dado batendo, tipo errado) quanto erro de tipo real (dado não batendo, como o caso do `buscarCorrelorPorSlug` — só apareceu por acaso de uma peculiaridade de supressão de erro do próprio compilador, não porque alguém foi checar se a query batia com a interface) |
| **Lote 23 — Consumer + alerta pra imob-queue-dlq** | Fecha a pendência real registrada no Lote 22 (linha da auditoria de fluxo completo, acima): a fila `imob-queue-dlq` já existia na conta Cloudflare, mas sem nenhum consumer vinculado — mensagens que esgotavam as 5 retentativas da `imob-queue` (`max_retries`, wrangler.toml) caíam lá e ficavam acumulando silenciosamente, só visíveis abrindo o painel do Cloudflare na mão. Adicionado um segundo `[[queues.consumers]]` em `wrangler.toml` (`queue = "imob-queue-dlq"`), separado do bloco da `imob-queue` principal — Workers só limita um consumer *por fila*, não por Worker, então não colide com o consumer já existente (fila diferente). Como a plataforma só permite um único export `queue()` por Worker, o roteamento entre os dois consumers acontece dentro dele (`src/index.ts`), lendo `batch.queue` (`MessageBatch.queue`) pra decidir entre `processarFilaAlteracoes` (`src/queue.ts`, inalterado) e o novo `processarFilaMorta` (`src/queue-dlq.ts`). O handler da DLQ, pra cada mensagem: loga o payload original completo (`console.error` + `JSON.stringify`, pelo menos fica no Cloudflare Logs) e dispara um e-mail de alerta via Resend reaproveitando o mesmo padrão de acesso à `RESEND_API_KEY` (via `process.env`, `nodejs_compat`) já usado em `src/routes/api-auth-recuperacao.ts`/`src/modulos/busca-salva-email/logica.ts` — texto simples com tipo da mensagem, `corretor_slug`/`cidade` (se presente no payload) e timestamp. Destinatário configurável via nova env var `EMAIL_ALERTA_OPERACIONAL` (`[vars]` no wrangler.toml + `.env.example`), nunca hardcoded. Falha no envio do e-mail é capturada e só logada — não derruba o processamento da mensagem nem gera retry/loop, mesmo princípio já usado em `tentarRevalidarAnuncio` (`api-anuncios-crud.ts`, comentário sobre `FILA_ALTERACOES`); a mensagem é sempre `ack()`ada depois de logar e tentar o alerta, senão ficaria retentando indefinidamente dentro da própria DLQ (que não tem outra `dead_letter_queue` configurada atrás dela). Reprocessamento automático e retry manual da DLQ ficam deliberadamente fora do escopo — só visibilidade/alerta. Testado localmente invocando `processarFilaMorta` diretamente com uma mensagem de exemplo e `fetch` stubado: confirmado log da mensagem original, chamada ao Resend com o payload esperado (tipo, corretor_slug, timestamp) e `message.ack()` chamado tanto no caminho de sucesso quanto no de falha simulada do envio do e-mail (a falha é capturada e logada, sem lançar exceção). `npm run typecheck`: 0 erros (mantido); `test/funil-completo.test.ts`: 10/10 sem quebrar | Mesmo padrão de reaproveitamento já estabelecido no projeto pra envio de e-mail (Resend via `process.env`/`nodejs_compat`, nunca um novo binding) e pra não deixar falha secundária virar erro/loop na fila principal; a limitação real de "um consumer por fila" (não por Worker) permitia o segundo `[[queues.consumers]]` sem contornar nada — só exigiu que o roteamento entre os dois handlers acontecesse dentro do único export `queue()` que a plataforma permite |
| **Auditoria — Asaas** | **Achado: a integração com Asaas nunca foi implementada, apesar de o documento afirmar em 4 lugares diferentes (seções 2.1, 2.2, 3 e nesta tabela, linha "Sessão inicial" acima) que já estava "implementada em modo sandbox".** Auditoria completa do histórico de git (não só `main`): `git log --all` com busca por "asaas"/"cobrança"/"billing"/"payment"/"sandbox"/"gateway" nas mensagens de commit; `git log --all --diff-filter=A --name-only` (todo arquivo já criado em qualquer commit de qualquer branch, mesmo depois apagado); `git grep` de "asaas" na árvore de arquivos das 66 branches remotas existentes (incluindo as ~46 sem PR associada); `git log --all -S"asaas"` (pickaxe, toda vez que a string entrou/saiu do conteúdo de qualquer arquivo). Resultado: a string "asaas" nunca apareceu em nenhum arquivo de código, em nenhum commit, em nenhuma branch — só em `project.md` (o próprio texto documentando o módulo) e na variável vazia `ASAAS_SANDBOX_API_KEY=` de `.env.example`. Busca via API do GitHub por "asaas" em título/corpo de todas as PRs e issues também não retornou nenhum resultado. Não é um caso do mesmo padrão da PR #56 (linha acima) — lá havia um commit real (`00d887b0`) numa branch íntegra, mesclado na base errada; aqui não existe nenhum commit de código em nenhum lugar pra recuperar. O próprio roadmap do documento (seção 2.3) já registrava corretamente "Fase 3: Cobrança ativa via Asaas — 🔲 Não iniciado", contradizendo as 4 menções a "já implementado" — inconsistência interna do próprio documento, sinal de que o texto "já implementado em sandbox" foi escrito de forma otimista/antecipada e nunca corrigido depois que o código não veio. As 4 menções enganosas foram corrigidas nesta sessão pra refletir o estado real (planejado, nunca implementado); nenhum código foi criado ou alterado — implementação do Asaas continua fora de escopo, é decisão de Fase 2/3 | Documentar divergência entre o que o `project.md` afirma e o que o histórico completo do repositório (todas as 66 branches, não só `main`) realmente contém, evitando que a próxima sessão de implementação planeje "conectar" um módulo que não existe, ou que alguém tente recuperar código que nunca foi commitado |
| **Módulo Asaas — infraestrutura implementada, desativada por padrão** | Fecha o achado acima com infraestrutura real, mas sem ativação nem vínculo com o fluxo de cobrança dos planos — decisão deliberada de escopo, não descuido. `src/services/asaas.ts`: cliente HTTP pra API sandbox do Asaas (`https://api-sandbox.asaas.com/v3`) com `criarClienteAsaas`/`criarCobrancaAsaas`/`consultarStatusCobrancaAsaas`; toda função checa a flag mestra `ASAAS_ATIVO` (env, precisa ser exatamente `"true"`) *dentro* do cliente, não só no chamador — retorna `{ ok: false, motivo: "modulo_desativado" }` explícito em vez de lançar exceção ou seguir em frente, e distingue isso de `"chave_ausente"`/`"erro_api"` reais. `src/routes/webhooks/asaas.ts`: novo endpoint `POST /api/webhooks/asaas`, valida o header `asaas-access-token` contra `ASAAS_WEBHOOK_TOKEN` (sem token configurado, rejeita tudo — nunca fica aberto), loga o evento recebido e nunca processa nada, com ou sem `ASAAS_ATIVO` — processar de verdade (atualizar status de cobrança, refletir no corretor) é decisão de implementação separada, de quando a Fase 3 for ativada. Rota montada em `src/index.ts` junto das outras rotas de API independentes de hostname — decisão deliberada de conectá-la (mesmo sem uso real ainda) pra não repetir a classe de bug "rota nunca montada" já registrada várias vezes nesta tabela (Lote 5/Lote 17). `ASAAS_ATIVO=false` adicionado a `[vars]` do `wrangler.toml` (não é segredo) e a `.env.example`; `ASAAS_SANDBOX_API_KEY`/`ASAAS_WEBHOOK_TOKEN` continuam só em `.env.example`, sem default, pra configurar via `wrangler secret put` quando a ativação for decidida. **Deliberadamente não tocado:** `src/routes/painel-corretor.ts`, `painel.js` e qualquer lógica de troca de plano (`queries-planos.ts`) — o módulo fica isolado, pronto pra ser ligado depois, sem qualquer efeito no comportamento atual do sistema. Validado: `npm run typecheck` (0 erros), `npm run lint` (exit 0), `test/funil-completo.test.ts` (10/10, nenhum teste novo necessário — nada do fluxo existente muda), `npm run build:css && wrangler deploy --dry-run` (bundle ok, `ASAAS_ATIVO="false"` aparece nos bindings do dry-run) | Construir a infraestrutura pronta pra ligar reduz o trabalho da futura ativação a configurar credenciais + decisão de negócio, sem deixar cobrança real acontecer por acidente enquanto isso — a flag é checada dentro do próprio cliente/webhook, não só no ponto de chamada, porque um chamador futuro que esqueça de checar continua seguro de qualquer forma |
| **Lote 21 — Painel do corretor — Meu Minisite** | Nova seção "Meu Minisite" no painel do corretor, acessível pelo menu lateral (`public/painel/index.html`, `public/assets/js/painel.js`): mostra a URL completa do minisite (`https://{minisite_slug}.imobiliarista.net`), um badge de status reaproveitando as mesmas classes CSS e o mesmo critério já usado pelo badge do header (`status-offline-badge`/`atualizarStatusOffline`) — offline quando `status === "pre-cadastro"` OU `minisite_offline` é truthy, senão online — e, condicionado a esse mesmo critério, ou um link "Visualizar meu site" (`target="_blank"`, abre a URL do próprio minisite) ou um texto explicando que o site fica no ar automaticamente assim que o CRECI for aprovado pelo superadmin, sem prometer prazo (a verificação é manual, seção 6.1). Escopo estritamente front-end: nenhuma rota de API nova foi criada — a seção só consome `minisite_slug`/`minisite_offline`, campos que `GET /api/painel-corretor/perfil` já devolvia antes desta mudança (confirmado em `src/routes/painel-corretor.ts` antes de iniciar a implementação). `src/` não foi tocado. Validado: `npm run typecheck` (0 erros, sem regressão da dívida zerada no Lote 22), `npm run lint` (exit 0), `test/funil-completo.test.ts` (10/10, nenhum teste novo necessário — nenhum contrato de API mudou) | Reaproveitar o endpoint e o critério de status já existentes evita duplicar lógica de decisão "site no ar vs. aguardando aprovação" em dois lugares do painel que pudessem divergir; manter o escopo só no front-end evita reabrir a fila de aprovação manual de CRECI (6.1/6.1.2), que é decisão de produto/processo separada, não desta tela |
| **Incidente de segurança — backup do D1 exposto publicamente via R2** | **Causa:** o export mensal do D1 (`src/scheduled.ts`, seção 4.13) sempre gravou o dump SQL — que inclui `senha_hash`, CPF e tokens de sessão (`sessoes`) de todos os corretores — em `env.DADOS_CACHE` (bucket `imob-dados`). Esse bucket, porém, **não é um bucket qualquer**: é o mesmo usado pelo restante do sistema pra servir JSON/XML público direto ao visitante, com Custom Domain (`https://dados.imobiliarista.net`) e URL `r2.dev` habilitados **por desenho**, permanentemente (seção 4.3/4.4 — "DECISÃO FECHADA" desde a sessão inicial). O backup nunca deveria ter sido colocado num bucket com essa característica; confirmado em 19/08/2026 que ambos estavam de fato habilitados, expondo publicamente qualquer arquivo em `backups/d1-export-*.sql`, incluindo dado sensível de todos os corretores cadastrados. **Mitigação imediata:** Custom Domain e URL `r2.dev` desabilitados manualmente no painel Cloudflare pelo dono do projeto, antes desta correção. **Ressalva importante registrada nesta correção:** essa mitigação manual, se ainda em vigor, também interrompe a entrega pública legítima de JSON/XML que depende do mesmo bucket (`dados.imobiliarista.net`) — portal, minisites, sitemaps, feeds, PWA (seção 4.4) —, já que o bucket nunca deveria ter sido só "fechado", e sim o backup movido pra fora dele. Reabilitar Custom Domain/r2.dev em `imob-dados` faz parte da correção definitiva abaixo (ele é público por desenho), não deve ficar desabilitado depois desta correção. **Correção definitiva (código, esta sessão):** novo bucket R2 dedicado e exclusivamente privado, `BACKUP_PRIVADO`/`imob-backup-privado` (`wrangler.toml`, `wrangler.test.toml`, `src/index.ts`), sem nenhum motivo legítimo de acesso público; `src/scheduled.ts` passou a gravar o dump ali, nunca mais em `DADOS_CACHE`. Comentários explícitos adicionados no `wrangler.toml` acima dos dois blocos de binding (por que `DADOS_CACHE`/`MIDIAS` **precisam** de Custom Domain público e por que `BACKUP_PRIVADO` **nunca pode** ter). Guardrail automatizado criado em `scripts/ci/verificar-bucket-backup-privado.js` — chama a API real da Cloudflare (`/r2/buckets/{bucket}/domains/custom` e `/domains/managed`) e falha se qualquer um estiver habilitado no bucket de backup; passo correspondente adicionado em `.github/workflows/ci.yml`, guardado por `if: secrets.CLOUDFLARE_API_TOKEN != ''` — **tarefa manual pendente, não executável neste ambiente sandboxed (sem credencial Cloudflare):** configurar os Secrets `CLOUDFLARE_API_TOKEN` (permissão "Workers R2 Storage: Read") e `CLOUDFLARE_ACCOUNT_ID` no repositório GitHub para o passo passar a rodar de verdade; até lá, o passo é pulado (nunca finge que passou). `docs/observabilidade.md` (procedimento manual de restauração) atualizado com o bucket/binding corretos — também corrigia de passagem um nome de bucket já desatualizado (`imobiliarista-jsons`) que nunca batia com `wrangler.toml`. **Sugestão registrada, não implementada** (mudaria a lógica de restauração existente sem necessidade — a correção do bucket privado já resolve a exposição): sufixo aleatório no nome do arquivo de backup (`d1-export-{ano}-{mes}-{hash}.sql`), defesa em profundidade caso o acesso público seja reabilitado por engano no futuro. **Achado separado, fora do escopo desta correção (não corrigido aqui):** `env.DADOS_CACHE` é lido para servir conteúdo público em vários outros pontos do código (`src/routes/sitemap.ts`, `src/status-backend.ts`, `src/site-backend.ts`, `src/middleware/bot-detect.ts`, `src/modulos/pwa/rota.ts`, `src/modulos/feed-portais-independentes/gerador.ts`/`rota.ts`) — todos consistentes com o desenho documentado em 4.3/4.4, nenhum achado novo aí; registrado só para reforçar por que o bucket de backup precisava ser outro, não pra reabrir auditoria desses pontos | O padrão "reaproveitar um binding existente porque já estava disponível" (aqui, gravar backup sensível no bucket que por acaso já era usado pra R2) é uma variação nova da mesma classe de risco já registrada várias vezes nesta tabela — a diferença é que aqui o binding reaproveitado tinha uma característica **estrutural e intencional** (Custom Domain permanente) incompatível com o dado gravado nele, não um bug de lógica; a correção certa nunca é "prometer não reabilitar Custom Domain" num bucket que precisa dele — é isolar o dado sensível num bucket que genuinamente não tem motivo pra ser público |
| **Incidente — CORS quebrado em `dados.imobiliarista.net`/`midias.imobiliarista.net` após reabilitar Custom Domain** | **Contexto:** fecha a ressalva deixada em aberto na linha acima ("Reabilitar Custom Domain/r2.dev em `imob-dados` faz parte da correção definitiva... não deve ficar desabilitado depois desta correção") — o dono do projeto reabilitou o Custom Domain de R2 nos dois hostnames públicos (seção 4.3/4.4), mas `fetch()` a partir de um minisite continuou falhando com erro de CORS, e não com o JSON esperado. **Causa raiz real (diagnosticada nesta sessão, não é bug de CORS):** `dados.imobiliarista.net` e `midias.imobiliarista.net` são subdomínios de `imobiliarista.net`, e a rota de Workers configurada pra este Worker é `*.imobiliarista.net/*` (seção 4.1) — **Workers Routes sempre tem precedência sobre R2 Custom Domain no mesmo hostname**, comportamento padrão e documentado da Cloudflare, sem exceção configurável pelo painel. Ou seja: toda requisição a esses dois hostnames **sempre** foi interceptada pelo Worker, nunca chegou a bater no R2 diretamente, com ou sem Custom Domain configurado — e o Worker, antes desta correção, tratava qualquer subdomínio como slug de corretor (`ehSubdominio`/`extrairSlugDoSubdominio`, seção 4.1), então `dados`/`midias` caíam no fluxo de tenant/`StatusBackend` (que não tem esse "corretor" cadastrado) em vez de servir o objeto do bucket — daí o erro aparecer como falha de CORS no navegador (a resposta de erro do fluxo de tenant nunca teve os headers de CORS que um `fetch()` cross-origin exige), mascarando a causa real. **Correção (esta sessão, `src/index.ts`):** bypass explícito no topo do `fetch()`, antes de qualquer lógica de tenant — mapa fixo `BUCKETS_R2_PUBLICO` (`dados.imobiliarista.net` → `DADOS_CACHE`, `midias.imobiliarista.net` → `MIDIAS`, checagem por igualdade exata de hostname, nunca por sufixo) serve o objeto direto do binding R2 (`bucket.get`/`bucket.head`, chave = pathname sem a barra inicial), sempre com `Access-Control-Allow-Origin` ecoando a `Origin` da requisição **apenas** quando ela é `imobiliarista.net` ou termina em `.imobiliarista.net` (nunca `*` genérico) e `Access-Control-Allow-Methods: GET, HEAD, OPTIONS` (conteúdo read-only); `OPTIONS` responde `204` com os mesmos headers (preflight); objeto inexistente responde `404` **com os mesmos headers de CORS** (sem isso o navegador reporta erro de CORS em vez do 404 real — exatamente o sintoma que gerou este incidente). Infraestrutura (Custom Domain de R2) não foi tocada — a decisão foi fazer o Worker servir esse conteúdo corretamente em vez de tentar contornar a precedência de Workers Routes, que não é configurável. Testes de integração novos em `test/r2-publico-cors.test.ts` (Miniflare real via `exports.default.fetch`, mesmo padrão do Lote 19) cobrem: eco correto de CORS pra origem de subdomínio/raiz autorizada, ausência do header pra origem fora de `imobiliarista.net`, preflight `OPTIONS` → `204`, `404` com CORS pra objeto inexistente, e confirmação de que o bypass roda antes da extração de slug (hostname fixo nunca é tratado como "corretor dados"). **Limitação de verificação local registrada:** `wrangler dev` local não foi útil pra validar isto ponta a ponta neste ambiente — a camada de assets estáticos do dev server local (`run_worker_first`/SPA fallback, seção 4.6) intercepta toda requisição `GET` sem extensão reconhecida como se fosse navegação de página **antes mesmo de invocar o Worker**, independente do `Host` enviado (`curl --resolve`/header `Host` manual), então não reproduz localmente o roteamento por hostname; os testes de integração acima, que chamam `exports.default.fetch` diretamente (mesma runtime Miniflare, sem essa camada de dev-server na frente), são a validação local confiável aqui — mesma classe de gap documentada em `wrangler.toml` pro mecanismo de cache (`ver comentário "MITIGAÇÃO (regressão pós-PR #50)"`) | Mesma lição já registrada nesta tabela sobre "só aparece rodando o fluxo real", numa camada nova: aqui não foi falta de teste, foi um diagnóstico raso anterior (tratar o sintoma — erro de CORS — como a causa) em vez de investigar por que a resposta de erro nunca tinha CORS pra começo de conversa; documentar explicitamente a precedência de Workers Routes sobre R2 Custom Domain evita que a mesma reabilitação de Custom Domain seja tentada de novo como solução da próxima vez que este sintoma aparecer |
| **Correção — `corretores/{slug}.json` nunca gerado pra corretor aprovado sem anúncio** | **Achado original:** um corretor real em produção (slug `aranda`) estava aprovado, com minisite liberado, mas sem nenhum objeto `corretores/aranda.json` no bucket `imob-dados` (a pasta `corretores/` nem chegava a existir pra ele). **Causa raiz confirmada lendo o código (não é regressão — gap estrutural desde a introdução do job):** o único gatilho existente pra `jobs/gerar-json-corretor.ts` sempre foi mutação de anúncio — `jobs/revalidacao-cruzada.ts::enfileirarRevalidacaoDoAnuncio`, chamado só por `api-anuncios-crud.ts`/`api-anuncios-backup.ts`. A aprovação do corretor (`rotaAprovarPreCadastro`) e a criação direta pelo Superadmin (`rotaCriarMinisite`) sempre enfileiraram só `gerar-status-minisite` (`tenants/{slug}/status.json`, controla se o minisite responde ou fica "indisponível") — nunca `gerar-json-corretor` (o índice de anúncios em si). Confirmado sistêmico, não isolado do `aranda`: o próprio `test/funil-completo.test.ts` já precisava chamar `processarGerarJsonCorretor` manualmente, "bypassando o transporte da Queue", em todo teste que precisava desse artefato depois de uma aprovação — nenhum teste dependia da aprovação sozinha gerá-lo. Não existe (nem existiu) rota administrativa de "regenerar minisite"; a única forma de descobrir o gap era ausência do objeto em R2, já que o schema de `corretores` não tem nenhum campo tipo `ultima_geracao_json`. **Correção:** novo helper `enfileirarGeracaoJsonCorretor` (`jobs/gerar-json-corretor.ts`, mesmo padrão de `enfileirarStatusMinisite`) chamado agora em `rotaAprovarPreCadastro` e `rotaCriarMinisite` (`routes/painel-superadmin.ts`), logo depois de `tentarMaterializarStatus` — mesmo princípio de tolerância a falha (`tentarMaterializarJsonCorretor`, não reverte a ação já persistida em D1, só avisa o Superadmin se o enqueue falhar). Nenhum caminho novo de geração foi criado — reaproveita a mesma fila (`FILA_ALTERACOES`) e a mesma mensagem (`tipo: "gerar-json-corretor"`) que `revalidacao-cruzada.ts` já usa. Confirmado que o job já lidava bem com zero anúncios sem alteração nenhuma (`listarAnunciosDoCorretor` retorna array vazio de forma limpa, `escreverJSON` grava `{listings: [], ...}` normalmente — sem crash). Teste novo em `test/funil-completo.test.ts` (seção 2) trava exatamente o caso que faltava: aprovar um corretor sem nenhum anúncio precisa enfileirar `gerar-json-corretor` com o slug certo e o job precisa materializar um JSON válido com `listings: []`. **Backfill (`scripts/backfill-json-corretor.js`), não executado nesta sessão:** varre `corretores`/`minisites` aprovados via `wrangler d1 execute --remote`, checa existência em R2 via `wrangler r2 object get --remote` e, pros que faltam, publica a mesma mensagem `gerar-json-corretor` direto na fila `imob-queue` via API HTTP da Cloudflare (`POST /accounts/{account_id}/queues/{queue_id}/messages`) — a `wrangler` instalada neste repositório (4.124.x) não tem `queues producer send` nem equivalente (confirmado rodando `--help`), então não dava pra fazer isso só com a CLI. Modo dry-run por padrão (`--confirmar` pra aplicar de verdade). **Tarefa manual pendente — o backfill precisa ser rodado manualmente em produção pelo dono do projeto, com credenciais Cloudflare reais (`wrangler` autenticado + `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`); não foi e não podia ser executado por esta sessão (sandbox sem credencial Cloudflare, mesma restrição já registrada nas linhas do incidente de backup e do guardrail de CI acima) — até rodar, todo corretor aprovado antes desta correção que ainda não tem anúncio nenhum continua sem `corretores/{slug}.json`, incluindo o `aranda` do achado original.** Validado: `npm run typecheck` (0 erros), `npm run lint` (exit 0), `test/funil-completo.test.ts` (11/11, 1 novo) | Mesma classe de risco já registrada várias vezes nesta tabela ("checagem/gatilho só em parte do fluxo" — linha da correção pós-auditoria de fluxo completo, acima, é o exemplo mais próximo), numa combinação nova: aqui o gatilho que faltava nunca existiu desde a criação do job, então não bastava corrigir o código — um backfill é inevitável pros registros que já passaram pelo caminho quebrado antes da correção existir; documentar isso explicitamente evita que a próxima sessão assuma que corrigir o trigger sozinho já resolveu o `aranda` |
| **Auditoria — consumers da fila crasham com mensagem malformada (fila principal e a própria DLQ)** | **Achado da auditoria de 2026-08-20:** tanto o consumer da fila principal (`src/queue.ts`) quanto o da dead letter queue (`src/queue-dlq.ts`, Lote 23) — que existe justamente pra tratar mensagens problemáticas — quebravam ao processar uma mensagem malformada, e sem `dead_letter_queue` configurada atrás do consumer da DLQ, essa mensagem morria em silêncio, sem log nem alerta. **Causa raiz confirmada lendo o código, dois pontos distintos:** em `src/queue.ts`, `msg.tipo` era lido dentro do `try` sem checar antes que `msg` (`message.body`) era de fato um objeto — pra um body `null`/`undefined`, isso lança `TypeError: Cannot read properties of null (reading 'tipo')`; o próprio bloco `catch` **também lia `msg.tipo`** pra montar a mensagem de log (linha 63 do arquivo original), então o mesmo `TypeError` escapava de novo ali, sem try/catch nenhum por fora do loop pra conter — derrubando o processamento de toda mensagem seguinte do batch. Em `src/queue-dlq.ts`, o defeito era mais grave: o loop de `processarFilaMorta` **não tinha try/catch nenhum** ao redor do processamento de cada mensagem (linha 84 do arquivo original, `JSON.stringify(msg)`, e a chamada a `enviarAlertaDlq` logo depois) — qualquer exceção aí (confirmado reproduzindo com um body de referência circular, que faz `JSON.stringify` lançar `TypeError: Converting circular structure to JSON`) derrubava o loop inteiro, deixando a própria mensagem problemática sem `ack()` (retentando dentro da DLQ, que não tem outra `dead_letter_queue` configurada atrás dela — exatamente o "morre em silêncio" da auditoria) e as mensagens seguintes do batch sem processar. Um body malformado que já era um objeto sem o campo `tipo` (ex: `{}`) **não** reproduzia o crash em nenhum dos dois — acesso a propriedade ausente de um objeto não lança, só `msg.tipo` num valor `null`/`undefined` lança; a checagem de formato adicionada cobre os dois casos mesmo assim, por defesa. **Correção — reaproveitando a função de checagem existente em cada arquivo, sem caminho de código duplicado:** ambos os handlers agora validam, no início do processamento de cada mensagem, que o body é um objeto com `tipo` em string; se não for, `ack()` (nunca `retry()` — payload malformado nunca fica bem-formado tentando de novo) e loga o conteúdo bruto, sem interromper as demais mensagens do batch. Em `src/queue.ts`, essa validação acontece antes do `try` existente, que continua fazendo `retry()` normalmente pra erro de *processamento* (D1/R2/etc., mensagem já validada) — não mudou o comportamento de retry legítimo. Em `src/queue-dlq.ts`, todo o corpo do loop passou a rodar dentro de um `try/catch` (a mudança estrutural principal, já que antes não existia nenhum) — qualquer falha, esperada (formato) ou não (serialização, erro dentro de `enviarAlertaDlq`), cai no `catch`, loga o valor bruto (sem tentar `JSON.stringify` de novo ali — se foi a serialização que falhou, serializar de novo lançaria outra vez; `console.error` aceita o valor direto) e o `ack()` (fora do try/catch, sempre executado) garante que a mensagem nunca fica retentando indefinidamente. **Deliberadamente não implementado (item 4 do achado, confirmado suficiente):** nenhuma `dead_letter_queue` de terceiro nível atrás do consumer da DLQ — o `catch` agora garante que nada escapa sem log, então uma fila adicional só pra capturar falha da DLQ seria redundante. O único ponto de falha "irrecuperável" já existente (envio do e-mail de alerta via Resend, dentro de `enviarAlertaDlq`) já tinha seu próprio try/catch específico desde o Lote 23, sem lançar — nenhum caso novo, não coberto, foi encontrado. **Teste que reproduz os dois crashes antes da correção**, travado em `test/fila-mensagem-malformada.test.ts`: batch com mensagem de body `null` (fila principal) e mensagem com referência circular (DLQ), cada uma seguida de uma mensagem bem-formada no mesmo batch — rodado contra o código anterior à correção, confirmou a promessa rejeitando (`TypeError` não capturado, exatamente nas duas linhas apontadas acima) em vez de resolver; depois da correção, resolve normalmente e confirma `ack()` (sem `retry()`) tanto na mensagem malformada quanto na mensagem seguinte do mesmo batch. Validado: `npm run typecheck` (0 erros), `npm run lint` (exit 0), `npm test` (26/26, 3 novos em `test/fila-mensagem-malformada.test.ts`, nenhuma quebra nos 23 já existentes) | Mesma classe de risco "só aparece rodando o fluxo real" já registrada várias vezes nesta tabela, numa variação nova: o handler pensado especificamente pra tratar mensagem problemática (a DLQ) era, na prática, o menos defensivo dos dois — sem nenhum try/catch, contra o handler principal que já tinha um (mesmo que incompleto); tratador de último nível precisa ser mais defensivo que o normal, nunca menos, porque não existe mais nenhuma rede de segurança depois dele |
| **Auditoria — bug de comparação de string na expiração de sessão (~24h de graça além do TTL)** | **Achado da auditoria de 2026-08-20:** sessão expirada continuava sendo aceita por até ~24h além do TTL de 30 dias documentado (seção 6.2). **Causa raiz confirmada lendo o código, 4 pontos com o mesmo padrão:** `src/lib/sessao.ts:22` (`obterCorretorAutenticado`), `src/lib/painel-admin-auth.ts:17` (`obterSuperadminIdDaSessao`), `src/lib/sessao-destino.ts:41` (`obterSessaoCompleta`) e `src/routes/painel-corretor.ts:35` (`obterCorretorIdDaSessao`, duplicata local da mesma checagem) faziam `WHERE ... AND expira_em > datetime('now')` **direto no SQL** — comparação de *string*, não de data. `expira_em` é gravado em `api-auth-login.ts` via `new Date(...).toISOString()`, formato ISO 8601 com separador `"T"` e sufixo `"Z"` (`"2026-08-20T14:00:00.000Z"`); `datetime('now')` do SQLite devolve seu próprio formato, com espaço em vez de `"T"` e sem `"Z"` (`"2026-08-20 14:00:00"`). SQLite compara TEXT byte a byte: os 10 primeiros caracteres (`"YYYY-MM-DD"`) são idênticos quando a sessão vence no dia corrente, e no 11º caractere `"T"` (0x54) sempre vence `" "` (0x20) — a comparação já decide "`expira_em` é maior" ali, **sem nunca chegar a comparar o horário**. Resultado prático: uma sessão que deveria expirar às 14h de hoje continua válida até a virada pra amanhã (quando o prefixo de data enfim diverge) — até ~24h de graça, exatamente o sintoma da auditoria; TTLs vencidos há dias (prefixo de data já diferente) sempre foram rejeitados corretamente, por isso o bug nunca apareceu num teste que só usasse "sessão bem antiga" para checar expiração. **Correção:** os 4 pontos passaram a buscar `expira_em` junto do resto da linha (sem filtrar no SQL) e comparar em código com `new Date(expira_em) <= new Date()` — comparação numérica de verdade (`Date` compara por epoch ms via `valueOf()`), imune a formato de string e sem depender de fuso horário (`new Date()`/`toISOString()` já operam em UTC internamente, mesmo padrão UTC já usado em `api-auth-recuperacao.ts::handleRedefinirSenha`, que já comparava `reset_tokens_senha.expira_em` assim — só as 4 checagens de sessão faziam a comparação errada em SQL). **Teste que reproduz o bug antes da correção, travado em `test/sessao-expiracao.test.ts`:** login real via `POST /api/auth/login`, depois `UPDATE sessoes SET expira_em = <início do dia UTC de hoje + 1ms>` (mesma data de "agora", horário já vencido — o cenário exato do bug) e `GET /api/auth/sessao` esperando `401`; rodado contra o código anterior à correção confirmou `200` (bug real, não hipotético), e passou a `401` depois da correção. Dois testes de guarda adicionais no mesmo arquivo: sessão dentro do TTL continua `200` (a correção não quebra o caso são) e sessão vencida há 10 dias (prefixo de data já diferente, caso que o bug nunca mascarava) continua `401`. **Isenção de cobrança (`isento_ate`) auditada à parte, não corrigida nesta PR:** mesma classe de campo "data limite" (`src/db/queries-isencao.ts`), mas confirmado que não existe, em lugar nenhum do código, uma comparação automática de `isento_ate` contra a data atual — o campo só é lido/gravado/logado por ação manual do Superadmin (conceder/editar/revogar em `painel-superadmin-isencao.ts`), nunca auto-expira sozinho. Não é a mesma classe de bug (não há comparação de data nenhuma pra corrigir); implementar auto-expiração de isenção por `isento_ate`, se desejado, é decisão de produto separada, fora do escopo deste achado. Validado: `npm run typecheck` (0 erros), `npm run lint` (exit 0), `npm test` (20/20, 3 novos em `test/sessao-expiracao.test.ts`, nenhuma quebra nos 17 já existentes) | Mesma classe de risco "só aparece rodando o fluxo real" já registrada várias vezes nesta tabela, numa variação nova: aqui nem precisou de um fluxo *incomum* — o bug só não aparecia porque todo teste de sessão existente até então usava datas de expiração óbvias (bem no futuro ou bem no passado), nunca o caso limite "vence hoje, mesma data UTC de agora", que é exatamente onde a comparação de string e a comparação de data divergem; formato de data inconsistente entre "gravado pela aplicação" (ISO 8601 via `toISOString()`) e "gerado pelo próprio banco" (`datetime('now')`) é um padrão que vale auditar em qualquer outra coluna DATETIME comparada direto em SQL, não só nas 4 corrigidas aqui |
| **Auditoria — sitemap dinâmico (Lote 11) nunca enfileirado, caminho morto de SEO** | **Achado da auditoria de 2026-08-20:** o job de geração de sitemap (`src/jobs/gerar-sitemap.ts`, seção 4.16) e o consumer da fila que sabe processá-lo (`src/queue.ts`, tipos `"gerar-sitemap-portal"`/`"gerar-sitemap-corretor"`) sempre existiram corretos, mas nenhum ponto do código jamais **enviava** essas mensagens — SEO por sitemap efetivamente fora do ar em produção, apesar do código existir, mesma classe "caminho nunca exercitado" já registrada várias vezes nesta tabela (mais recente: reconstrução do feed VRSync, achado (1) — `dispararGeracaoXMLGrupoOLX` nunca chamada). **Design original confirmado antes de corrigir (não presumido):** a seção 4.16 já previa o sitemap "gerado no mesmo processo em lote que já gera os JSONs/XMLs" — ou seja, disparado junto do fluxo de revalidação cruzada (seção 4.4.1.1, evento por mutação de anúncio via `FILA_ALTERACOES`), **não** por Cron Trigger nem por requisição; confirmado também que o único `[triggers]`/`crons` existente em `wrangler.toml` é o export mensal do D1 (`src/scheduled.ts`, seção 4.13) — sem nenhuma relação com sitemap, descartando de vez a hipótese de "falta um cron". **Causa raiz exata:** `src/jobs/revalidacao-cruzada.ts::processarRevalidacaoCruzada` monta o array de mensagens de fan-out da Queue (`gerar-json-corretor`, `gerar-json-cidade`, `gerar-json-anuncio`, uma `gerar-feed-portal-independente` por cota ativa) e nunca incluía as duas mensagens de sitemap. **Correção:** adicionadas `{ tipo: "gerar-sitemap-portal" }` e `{ tipo: "gerar-sitemap-corretor", corretor_id, corretor_slug, cidade_slug }` a esse mesmo array — reaproveita o padrão de disparo por evento já existente, sem Cron Trigger novo e sem estrutura nova; dispara na mesma cadência do resto do lote (por mutação de anúncio), então não há periodicidade separada pra escolher/documentar aqui (diferente do backup mensal do D1, que é, esse sim, cron por natureza — export point-in-time sem gatilho de evento equivalente). **Bug secundário encontrado testando a correção com dado real, corrigido na mesma sessão:** a query paginada de anúncios em `processarGerarSitemapPortal` (`src/jobs/gerar-sitemap.ts`, dentro do loop de `sitemap-anuncios-{n}.xml`) selecionava `c.nome as cidade_nome` mas nunca `c.id`/`cidade_id` — a chamada seguinte, `obterCidadeSlug(anuncio.cidade_id, env)`, sempre recebia `undefined` e quebrava com `D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'` assim que o job rodava com pelo menos um anúncio real (nunca antes, porque o job nunca tinha rodado de verdade). Corrigido adicionando `c.id as cidade_id` ao `SELECT`, mesmo padrão já usado corretamente na query irmã de `processarGerarSitemapCorretor`. **Teste novo, `test/sitemap-job-trigger.test.ts`:** cria corretor aprovado + anúncio real via API, chama `processarRevalidacaoCruzada` diretamente (bypassando o transporte da Queue, mesma abordagem de `funil-completo.test.ts`) e confirma as duas mensagens de sitemap no fan-out; materializa os jobs de verdade e confirma XML bem formado (`<?xml version="1.0"...`, `<urlset`) com a URL do anúncio real em `sitemap-cidades.xml`, `sitemap-anuncios-1.xml` e `sitemaps/minisite-{slug}.xml`; confirma as rotas públicas (`/sitemap-index.xml` no domínio raiz, `/sitemap.xml` no subdomínio do minisite, seção 4.16) servindo esse conteúdo direto do R2, sem gerar nada na leitura. Validado: `npm run typecheck` (0 erros), `npm run lint` (exit 0), `npm test` (24/24, 1 novo em `test/sitemap-job-trigger.test.ts`, nenhuma quebra nos 23 já existentes) | Mesma classe de risco "caminho nunca exercitado" já registrada várias vezes nesta tabela — a diferença aqui é que a auditoria já vinha com a causa raiz certa (código correto, gatilho ausente), então o risco real era presumir a solução (cron) sem ler o design original documentado em 4.16, que já apontava pro padrão de evento já usado pelo resto do lote; testar a correção com dado real (não só "a mensagem foi enfileirada") é o que expôs o segundo bug (`cidade_id` ausente na query) — confirma, mais uma vez, que só rodar o fluxo de ponta a ponta pega esse tipo de defeito |
| **Auditoria — mapa da listagem/detalhe (`mapa.js`) nunca acionado por nenhuma UI, apesar de pronto e documentado como concluído** | **Achado da auditoria de 2026-08-21:** `public/assets/js/mapa.js` sempre teve `initListingMap`/`toggleMapView`/`initDetailMap` completos (Leaflet + tiles OpenStreetMap, pins reais lidos de `latitude`/`longitude`, exatamente como a seção 9.2 — "Alternância lista ↔ mapa", DECISÃO FECHADA — e o Lote 7 do roadmap, marcado 🟢 Concluído, descrevem), mas nenhum botão/`onclick` em lugar nenhum do HTML ou de outro `.js` jamais chamava `toggleMapView()` — mesma classe "caminho nunca exercitado" já registrada várias vezes nesta tabela (mais recente: sitemap, linha acima). O mapa da página de detalhe estava igualmente morto por um motivo diferente: `initDetailMap()` só era disparado por um `MutationObserver` que reagia à troca de classe do `#detail-view`, mas só agia se `#map-container` **já não estivesse** `hidden` — e nada em `showDetail()` (`app-ui.js`) jamais removia esse `hidden`, então a condição nunca era satisfeita. **Causa raiz adicional, específica deste achado:** `#map-container`/`#map` só existiam no markup do detalhe (`public/index.html`); reaproveitar os mesmos ids na `#listing-view` teria produzido HTML com id duplicado (`getElementById` sempre resolveria pro primeiro do documento, ambíguo entre as duas views) — faltava wiring de DOM, não só o clique do botão. **Correção (esta sessão):** (1) novo botão `#toggle-map-view` + container próprio `#map-container-listagem`/`#map-listagem` na `#listing-view` (ids distintos do detalhe, ver acima); `toggleMapView()` (`mapa.js`) atualizado pra usar esses ids e alternar o rótulo do botão; `renderListings()` (`app-ui.js`) passa a chamar `refreshListingMapIfVisible()` (`mapa.js`, nova) a cada filtro/ordenação, atualizando os pins com `appState.filteredListings` sem fechar/reabrir o mapa, como pedido. (2) `showDetail()` (`app-ui.js`) passa a chamar `initDetailMap()` direto quando o anúncio tem `latitude`/`longitude` — único gatilho agora, sem depender de estado incerto de classe; o `MutationObserver` (que nunca disparava e, se disparasse depois desta correção, duplicaria a inicialização) foi removido de `mapa.js`, mantendo só a geolocalização no `DOMContentLoaded`. (3) **Deduplicação de geolocalização:** existiam duas implementações independentes da mesma feature (sugestão de cidade mais próxima na home) — `app-roteamento.js::detectLocation` (4 cidades, distância euclidiana simples), chamada de `app.js::initializeApp()`, e `mapa.js::detectLocationAndSuggestCity` (10 cidades, Haversine, rótulo com UF) — ambas rodando sempre, em toda página (inclusive minisite), cada uma pedindo geolocalização e logando erro separadamente; era essa duplicidade que explicava o erro de geolocalização visto no console ao carregar um minisite. Mantida só a de `mapa.js` (cobertura e precisão maiores); `detectLocation`/`suggestNearestCity`/`displayCitySuggestion` e a chamada em `initializeApp()` foram removidas — as duas fazem exatamente a mesma coisa, não é um caso de "não forçar fusão". (4) Google Maps (`initGoogleMap`, opção premium) deliberadamente **não** conectado — fica pra quando o campo de API key por corretor (seção 3/6.3) for implementado, fora de escopo aqui. **Validado:** `npm run typecheck` (0 erros), `npm run lint` (exit 0), `npm test` (24/24, nenhuma quebra — a suíte existente é toda de backend/Workers, sem harness de navegador). Teste manual de ponta a ponta com Chromium real via Playwright (`cdnjs.cloudflare.com` está fora da allowlist de rede deste ambiente sandboxed, então o script do Leaflet foi interceptado via `page.route()` e substituído por um shim mínimo que grava cada `L.map`/`L.marker` chamado, sem alterar nenhuma linha de `mapa.js`) contra um servidor estático local do `public/`: busca com 3 imóveis fictícios (2 com coordenadas, 1 sem) → alternar pra mapa (2 pins nas coordenadas certas, o sem-coordenada corretamente ausente) → trocar filtro com o mapa aberto (mapa não fecha, pin atualiza pra 1, contador reflete o filtro) → limpar filtro e abrir o detalhe do imóvel com coordenada (mapa aparece com o pin certo) → abrir o detalhe do imóvel sem coordenada (mapa fica escondido) — todas as 13 asserções passaram | Mesma classe "caminho nunca exercitado" já registrada várias vezes nesta tabela, numa variação nova: aqui a UI nunca foi conectada por dois motivos empilhados (nenhum clique dispara `toggleMapView`, e o gatilho do detalhe dependia de uma condição de classe que ninguém jamais satisfazia) — e reaproveitar os containers Leaflet da view de detalhe pra listagem exigia ids únicos por view, não só reusar a mesma lógica de desenho; a duplicação de geolocalização é a mesma lição de sempre (código que faz a mesma coisa duas vezes, nunca consolidado, porque nada testava o fluxo do navegador de ponta a ponta) numa camada de frontend, não de backend |
| **`anuncios` nunca teve `latitude`/`longitude` — nenhum imóvel real podia ter pin no mapa, mesmo com o mapa já ligado na UI (linha acima)** | **Achado ao preparar `scripts/seed-anuncios-teste.js` (2026-08-21), na mesma sessão em que a linha acima ligou o mapa na UI:** `mapa.js` lê `listing.latitude`/`listing.longitude` de cada item, mas a tabela `anuncios` (`migrations/0001_init.sql`) nunca teve essas colunas — só `cidades` tem lat/long — e nenhum dos jobs que materializam os JSONs públicos que o front-end consome (`gerar-json-cidade.ts`, `gerar-json-corretor.ts`; `appState.allListings`, em `app-dados.js`, vem de um desses dois) emitia esses campos. A correção da linha acima ligou a UI a um caminho de dado que, na prática, nunca existiu — o smoke test manual daquela correção usou 3 imóveis fictícios (`page.route()`/shim, sem D1 real), então não passou pelo pipeline D1 → job → JSON e não podia ter exposto este gap. **Correção, mínima e aditiva:** `migrations/0017_anuncios_geolocalizacao.sql` (`ALTER TABLE anuncios ADD COLUMN latitude/longitude REAL`, nullable — nem todo anúncio tem geocodificação, e `mapa.js` já trata a ausência); `latitude?`/`longitude?` adicionados a `Anuncio` (`src/types/modelos.ts`) e às interfaces/`SELECT`/mapeamento de `AnuncioCidadeItem` (`gerar-json-cidade.ts`) e `AnuncioCorretorItem` (`gerar-json-corretor.ts`) — `gerar-json-anuncio.ts` (detalhe pra bot/SEO) não foi tocado, porque `showDetail()` usa `appState.allListings`, nunca esse JSON. Formulário de criar/editar anúncio (`api-anuncios-crud.ts`) deliberadamente não alterado — sem campo de geocodificação na UI do corretor ainda, fora do escopo mínimo pra desbloquear o seed de teste. Validado: `npm run typecheck` (0 erros), `npm run lint` (exit 0), `npm test` (24/24, migration nova aplicada automaticamente ao D1 de teste via `readD1Migrations`, nenhuma quebra). Sem teste automatizado novo — não há harness de navegador na suíte (mesma lacuna da linha acima) pra travar "pin aparece com dado real vindo do D1"; a validação de ponta a ponta fica pro seed manual (`scripts/seed-anuncios-teste.js --confirmar`, tarefa manual, mesma restrição de sandbox sem credencial Cloudflare já registrada nas linhas de backfill/backup acima) | Uma correção de UI que "liga" um caminho de dado (linha acima) pode ligar a ponta errada: o gatilho que faltava era real, mas o dado que ele passou a exibir nunca teve onde nascer — só apareceu porque este achado seguiu a cadeia até o D1 em vez de parar na confirmação visual (Playwright com dado mockado); sempre que uma correção de frontend depende de um campo específico do payload, vale confirmar que esse campo tem uma coluna de origem e um job que o propague, não só que a UI o exibe quando presente |

## Footer

[https://github.com](https://github.com) © 2026 GitHub, Inc.
