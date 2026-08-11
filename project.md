# PROJECT.md — Constituição do Projeto

> Este documento é a fonte única da verdade do projeto **Portal Imobiliário (Multisites)**.
> Toda decisão de arquitetura, escopo, regra de negócio ou convenção de código
> deve estar registrada aqui antes de ser implementada. Nenhum código deve
> contradizer o que está definido neste arquivo. Se algo mudar, este arquivo
> muda primeiro — o código muda depois.

**Status:** 🟢 Todos os 17 lotes do roadmap original implementados
**Última atualização:** Lote 17 (Backup/Exportação de Anúncios) implementado — corrigido bug crítico de roteamento (CRUD de anúncios via API estava desconectado desde o Lote 5) descoberto durante a implementação
**Versão:** 1.8

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
  * Módulo de integração com **Asaas** já implementado em modo sandbox/teste (sem cobrança real disparada nesta fase).
- Botão **"Fale com o corretor"** via WhatsApp em cada anúncio (substitui chat interno).
- **PWA** (Progressive Web App), módulo opcional por plano — ver 4.18.
- **Publicações** (feed de blog do corretor ou feed padrão da rede), módulo opcional por plano — ver 4.19.
- **Fila de alterações em lote** no painel do corretor (ver seção 4.4).
- Compartilhamento de listas JSON de anúncios entre domínios diferentes (via R2).
- **Feed XML (formato VRSync) por corretor**, para integração com ZAP/OLX/VivaReal/Chaves na Mão (ver seção 4.11).

### 2.2 Fora do escopo (fase 1)

- Chat interno entre corretor e visitante (substituído por link direto de WhatsApp por anúncio).
- App mobile nativo (substituído por PWA).
- **Cobrança ativa via Asaas** (módulo implementado em sandbox, mas sem cobrança real disparada).
- **Captura de leads via formulário + gestão de contatos (CRM-lite)** — adiado para fase futura por gerar processamento/armazenamento adicional.
- **Insights/Analytics de desempenho** (visualizações por anúncio, engajamento) — mesmo motivo acima.
- **Descartado definitivamente** (não só "fora da fase 1"): Sistema de imobiliárias (empresas com vários corretores agrupados) — plataforma é só para corretores individuais, decisão permanente.

### 2.3 Fases futuras (roadmap)

| Fase | Entregável                                                                    | Status            |
| ---- | ----------------------------------------------------------------------------- | ----------------- |
| 1    | Portal + minisites + painéis + rede de anúncios + PWA + Publicações           | 🟢 Fundação em produção — expansão em planejamento |
| 2    | Captura de leads + gestão de contatos + insights de desempenho (CRM completo) | 🔲 Não iniciado    |
| 3    | Cobrança ativa via Asaas                                                      | 🔲 Não iniciado    |
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
| Cobrança (futuro)          | Asaas — módulo/integração já implementado em **modo sandbox**, sem cobrança real disparada nesta fase                                                                         |                                                                                                                                 |
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
│   ├── queue.ts                    # consumer da Cloudflare Queue (processa o lote, 4.4)
│   ├── scheduled.ts                # Cron Triggers (export D1 mensal, geração periódica)
│   │
│   ├── middleware/
│   │   ├── www-redirect.ts           # remoção do "www" (4.5)
│   │   └── bot-detect.ts             # dynamic rendering pra bots (4.6)
│   │
│   ├── routes/                     # núcleo obrigatório (não modularizado — sempre ativo)
│   │   ├── portal.ts                 # rotas do portal público
│   │   ├── minisite.ts               # rotas dos minisites
│   │   ├── painel-corretor.ts        # painel do corretor
│   │   ├── painel-superadmin.ts      # painel do superadmin (aprovações, cidades, módulos, planos)
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
│   ├── painel/index.html
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

[[routes]]
pattern = "imobiliarista.net/*"
zone_name = "imobiliarista.net"

[[routes]]
pattern = "*.imobiliarista.net/*"
zone_name = "imobiliarista.net"
```

Acesso a D1 e R2 sempre via **binding direto** (não API REST/S3 SDK externo) — mais rápido, mais barato, sem tokens expostos.

R2 em dois buckets separados: `DADOS_CACHE` (`imob-dados`) para os JSONs de cidade/corretor, XMLs de feed e backups do D1; `MIDIAS` (`imob-midias`) para as fotos dos anúncios. Cada bucket tem sua própria URL pública `*.r2.dev` (ver 4.4), consumida pelo front-end via as constantes `R2_DADOS_URL`/`R2_MIDIAS_URL` em `public/assets/js/app.js` — trocar ali quando migrarmos para domínio customizado.

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
- **Painel do corretor/superadmin também como Static Asset:** o HTML/CSS/JS da interface do painel é servido como Static Asset (grátis, sem invocar o Worker); só as chamadas de API que efetivamente leem/gravam dado (login, salvar anúncio, etc.) tocam o Worker.
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
- **Camada de reforço — export periódico para R2:** Cron Trigger mensal executa `wrangler d1 export` (dump SQL) e salva o arquivo no R2, para retenção além dos 30 dias do Time Travel e como cópia redundante fora do D1. Custo irrisório dado o tamanho do banco no volume projetado.

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

**robots.txt:** servido dinamicamente pelo Worker (varia por hostname — portal vs. minisite), com `Disallow: /painel/` e `Disallow: /api/`, `Allow: /`, e a linha `Sitemap:` apontando pro sitemap daquele host específico. Rotas utilitárias (`/apps/*`, ver 4.18) marcadas `noindex,follow`.

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
| 9  | Painel do superadmin   | `routes/painel-superadmin.ts` (aprovações, cidades, módulos on/off), `public/painel/superadmin.html`                                                                                                      | 🟢 Concluído |
| 10 | PWA (versão original)  | `manifest.json`, `sw.js`, `cache-buster.js` — versão universal, sem gate por plano (ver Lote 15 pra evolução com controle por plano)                                                                     | 🟢 Concluído |
| 11 | SEO                    | `routes/sitemap.ts`, `jobs/gerar-sitemap.ts`, dynamic rendering via `bot-detect.ts`                                                                                                                       | 🟢 Concluído |
| 12 | Módulos opcionais      | `src/modulos/`: 12.1 feed-grupo-olx · 12.2 feed-portais-independentes · 12.3 busca-ia · 12.4 video-youtube · 12.5 tour-360 · 12.6 busca-salva-email · 12.7 agendamento-visita · 12.8 comparacao-anuncios · 12.9 calculadora-financiamento | 🟢 Concluído |
| 13 | Backup/observabilidade | `scheduled.ts` (Cron Trigger mensal export D1→R2), `docs/observabilidade.md` (guia manual Time Travel/Rate Limiting/alertas)                                                                             | 🟢 Concluído |
| 14 | Sistema de Planos expandido | Migration `0010_planos.sql` — tabela `planos` (catálogo, 5 níveis); `corretores.plano_id`; tabela antiga renomeada pra `config_upload_corretor`; `db/queries-planos.ts`, `db/queries-isencao.ts`; CRUD no painel-superadmin (rotas dedicadas `painel-superadmin-planos.ts`/`painel-superadmin-isencao.ts`); regras de troca de plano (6.4); Promoção de Lançamento (6.5); Controle de Isenção (6.6, tabela `log_isencao`) | 🟢 Concluído |
| 15 | PWA por Plano          | Migration `0011_modulo_pwa.sql`; módulo `src/modulos/pwa/` (`logica.ts`, `gerador-manifest.ts` +2); controle duplo (flag de rede + `permite_pwa` do plano); rotas `/apps/*`; `pwa-instalador.js`; Service Worker "suicida"; arquivos estáticos antigos do Lote 10 removidos (substituídos pela geração dinâmica por corretor/plano) | 🟢 Concluído |
| 16 | Publicações            | Migration `0012_publicacoes.sql` (flag de rede) + `corretores.config_modulos` (JSON genérico, novo precedente de schema); módulo `src/modulos/publicacoes/`; painel do corretor (opt-in feed próprio/padrão); menu principal do minisite; Service Worker network-only para `/publicacoes` e domínio do Blogspot; sitemap inclui posts individuais. Pendente: `FEED_PADRAO_REDE_URL` ainda é placeholder — trocar quando o blog institucional existir | 🟢 Concluído |
| 17 | Backup/Exportação de Anúncios pelo Corretor | `src/routes/api-anuncios-backup.ts` (arquivo companheiro, `api-anuncios-crud.ts` já no limite de linhas): backup interno (schema próprio, só links R2), restauração em modo seguro (rejeita se ultrapassar limites do plano), exportação sob demanda via slug do portal (`/exportar/{slug-do-portal}`, reaproveitando `vrsync-mapper.ts`); `restaurarAnuncioComId` em `queries-anuncios.ts` | 🟢 Concluído |

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
| Sessão inicial | Módulo Asaas em sandbox desde já; cobrança real adiada para fase 3                                                                                                                                        | Deixar a integração pronta sem gerar cobrança precoce                                                                                                                                                    |
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
| **Auditoria pós-Lote 17** | `calculadora-financiamento/rota.ts` e `comparacao-anuncios/rota.ts` são bibliotecas de cálculo 100% client-side, sem rota HTTP própria — não têm "servir" no sentido de request ao Worker. O JS desses widgets (e de `busca-salva-email.js`) já esperava um sinal `data-modulos-ativos` no `<html>`, mas nenhuma rota jamais escrevia esse atributo; na prática os widgets nunca respeitavam a flag de rede. Decisão (consistente com o padrão de PWA/Publicações, seção 4.18/4.19): a checagem acontece na **geração em lote**, não em tempo de requisição — `jobs/gerar-json-corretor.ts` agora inclui `modulosAtivos: { calculadoraFinanceira, comparacaoAnuncios }` em `corretores/{slug}.json` (mesmo `estaModuloAtivo`, seção 4.2.1). `app-dados.js` guarda esse campo em `appState.modulosAtivos`; os dois widgets passam a ler dali em vez do atributo HTML morto. Deliberadamente **não** foi tocado `routes/portal.ts`/`routes/minisite.ts` — eles servem o shell da SPA via Workers Static Assets (seção 4.6) e não devem processar nada por visita humana. **Lacuna residual conhecida:** páginas de listagem por **cidade** (`fetchCityListings`/`cidades/{slug}.json`, `jobs/gerar-json-cidade.ts`) ainda não carregam esse campo — o ícone/botão de comparação em `comparacao-anuncios.js` nessas páginas específicas ainda cai no fallback de desenvolvimento (query param/sessionStorage) até uma extensão futura do mesmo padrão pra `gerar-json-cidade.ts` | Reaproveitar o mecanismo de controle por flag de rede já validado em PWA/Publicações em vez de inventar um novo (endpoint dedicado ou atributo HTML dinâmico), respeitando a arquitetura de custo fechada (Workers Static Assets, sem processamento por visita) |

## Footer

[https://github.com](https://github.com) © 2026 GitHub, Inc.
