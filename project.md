# PROJECT.md — Constituição do Projeto

> Este documento é a fonte única da verdade do projeto **Portal Imobiliário (Multisites)**.
> Toda decisão de arquitetura, escopo, regra de negócio ou convenção de código
> deve estar registrada aqui antes de ser implementada. Nenhum código deve
> contradizer o que está definido neste arquivo. Se algo mudar, este arquivo
> muda primeiro — o código muda depois.

**Status:** 🟢 Aprovado — Versão 1.0
**Última atualização:** sessão de planejamento inicial (fechamento de todas as pendências abertas)
**Versão:** 1.0

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
  3. PWA leve, tanto para o portal quanto para os minisites dos corretores.
  4. Fila de alterações em lote no painel, minimizando requisições ao banco.

---

## 2. Escopo

### 2.1 Dentro do escopo (fase 1)
- Portal público com filtro de cidade: Home → `/cidade` (ex: `/londrina`) → filtros avançados (tipo de negócio, tipo de imóvel) → `/cidade/negocio/tipo` → listagem de anúncios (cards horizontais/verticais, mapa) → página do anúncio individual (com dados do corretor e seus outros anúncios).
- Minisites de corretores: `nome.imobiliarista.net`, mesmo template para todos, exibindo somente os anúncios daquele corretor. **Padrão único, sem suporte a múltiplos corretores por site (sem "imobiliária").**
- Dois painéis administrativos:
  - **Superadmin:** gestão de toda a rede e dos minisites.
  - **Dono do site (corretor):** configurações de conta, site e anúncios.
- Anúncios funcionam como "posts" (CRUD completo: incluir, editar, excluir), com toggle **"postar na rede"** (ligado por padrão a cada cadastro; se desligado, o anúncio some da rede e fica visível só no minisite do corretor).
- **Campos personalizados/comodidades** por anúncio (piscina, mobiliado, churrasqueira, etc.).
- **Busca salva / alerta de novos imóveis por e-mail** (visitante salva critérios de busca e recebe aviso quando surgir anúncio compatível).
- **Agendamento de visita ao imóvel** (visitante solicita horário; corretor confirma).
- **Comparação entre anúncios** (visitante compara 2-3 imóveis lado a lado).
- **Calculadora de financiamento** (widget no anúncio).
- **Mapas via OpenStreetMap + Leaflet.js** (gratuito, sem chave de API) como padrão para todos; Google Maps API disponível como opção premium (corretor usa sua própria chave, via campo no Plano).
- **Geolocalização do visitante** (`navigator.geolocation`, nativa do navegador) para sugerir a cidade mais próxima na home.
- **Sistema de planos/limites** (necessidade técnica, não feature de cobrança):
  - Número máximo de anúncios permitidos.
  - Número máximo de fotos por anúncio (e resolução máxima de upload).
  - Campo para o corretor inserir sua própria chave de API do Google Maps (opcional).
  - Módulo de integração com **Asaas** já implementado em modo sandbox/teste (sem cobrança real disparada nesta fase).
- Botão **"Fale com o corretor"** via WhatsApp em cada anúncio (substitui chat interno).
- **PWA** (Progressive Web App) tanto para o portal quanto para os minisites — leve, instalável, sem loja de aplicativo.
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
| Fase | Entregável | Status |
|---|---|---|
| 1 | Portal + minisites + painéis + rede de anúncios + PWA | 🟡 Em planejamento |
| 2 | Captura de leads + gestão de contatos + insights de desempenho (CRM completo) | 🔲 Não iniciado |
| 3 | Cobrança ativa via Asaas | 🔲 Não iniciado |
| 4 | Sistema de imobiliárias (multi-corretor) | 🔲 Não iniciado |

---

## 3. Stack Técnica

| Camada | Tecnologia | Observação |
|---|---|---|
| Frontend | HTML + JS simples + **Tailwind CSS** (sem Bootstrap ou outro framework CSS junto — evita conflito de resets/especificidade e peso duplicado) | Filtros e listagem processados no navegador a partir do JSON recebido |
| PWA | Manifest + Service Worker | Portal e minisites |
| Hospedagem/Infra | Cloudflare Workers | Conectado ao repositório GitHub |
| Banco de dados | Cloudflare D1 | Uso restrito: escrita + leitura administrativa (painéis). Nunca lido diretamente pelo visitante público |
| Armazenamento/distribuição | Cloudflare R2 | JSONs por cidade + imagens dos anúncios. Exposto via subdomínio público próprio, contornando o Worker nas leituras do visitante |
| Cache | Cloudflare Edge Cache | Cache-Control agressivo nos JSONs; regra "Cache Everything" |
| Fila/lote | **Cloudflare Queues** (não Durable Objects) — `max_batch_size` + `max_batch_timeout` já fazem nativamente a agregação de mensagens de múltiplos corretores no mesmo intervalo | 10.000 operações/dia grátis no plano Workers Free |
| Mapas | **OpenStreetMap + Leaflet.js** (padrão, gratuito, sem chave de API) · Google Maps API (opcional/premium, chave do próprio corretor) | |
| Geolocalização | `navigator.geolocation` (nativa do navegador) | Sugerir cidade mais próxima na home |
| Cobrança (futuro) | Asaas — módulo/integração já implementado em **modo sandbox**, sem cobrança real disparada nesta fase | |
| Domínio | imobiliarista.net | Wildcard `*.imobiliarista.net` para minisites |
| Repositório | github.com/Imobiliarista/Portal | |

### 3.1 Limites do plano Free da Cloudflare (referência, verificar periodicamente)
| Serviço | Limite gratuito |
|---|---|
| Workers | 100.000 requisições/dia · 10ms CPU/invocação · 128 MB memória · 50 subrequisições/requisição |
| D1 | 5 GB armazenamento · 5.000.000 linhas lidas/dia · 100.000 linhas escritas/dia |
| R2 | 10 GB armazenamento · 1.000.000 gravações/mês · 10.000.000 leituras/mês · **zero egress sempre** |

---

## 4. Arquitetura

### 4.1 Roteamento — DECISÃO FECHADA
- Implementação: **Worker puro** (não Cloudflare Pages/Pages Functions) — Pages não suporta subdomínio wildcard dinâmico de forma nativa e confiável (limitação confirmada na documentação/comunidade oficial da Cloudflare em 2026).
- DNS: registro wildcard `*.imobiliarista.net` **obrigatoriamente com proxy ativado (nuvem laranja)**. DNS-only (nuvem cinza) impede o Worker de interceptar qualquer requisição.
- Rota do Worker (padrão oficial "hostname routing" da Cloudflare para SaaS multi-tenant por subdomínio):
  ```toml
  [[routes]]
  pattern = "*.imobiliarista.net/*"
  zone_name = "imobiliarista.net"
  ```
- Dentro do código, o Worker lê `request.headers.get("host")` para decidir: domínio raiz → Portal público; subdomínio → minisite do corretor correspondente.
- O GitHub continua sendo apenas o repositório de código/versionamento — o Worker é implantado automaticamente a partir dele (Workers Builds), mas quem serve as requisições ao vivo é sempre o Worker rodando no Edge da Cloudflare, nunca o GitHub diretamente.

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
│   │   ├── painel-superadmin.ts      # painel do superadmin (aprovações, cidades, módulos)
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
│   │   └── calculadora-financiamento/
│   │
│   ├── db/
│   │   ├── queries-anuncios.ts
│   │   ├── queries-corretores.ts
│   │   ├── queries-cidades.ts
│   │   ├── queries-cotas-portal.ts   # CotaPortal (4.11)
│   │   └── queries-modulos.ts        # flags ativo/inativo (4.2.1)
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
│   └── 0004_modulos.sql             # tabela modulos_ativos (4.2.1)
│
└── tests/
```

### 4.2.1 Sistema de módulos ativáveis/desativáveis — DECISÃO FECHADA
Inspirado no modelo de plugins do WordPress, mas adaptado à realidade técnica do Cloudflare Workers (código compilado num único bundle no deploy — não existe "soltar arquivo novo e o sistema reconhece sozinho", diferente do PHP tradicional). Resolve as duas necessidades por caminhos diferentes:

- **Organização em módulos autocontidos** (`src/modulos/`): cada funcionalidade opcional (busca por IA, feeds externos, vídeo, tour 360°, busca salva, agendamento, comparação, calculadora) fica isolada em sua própria pasta — fácil de localizar, editar ou remover sem mexer no restante do sistema.
- **Flags ativo/inativo no D1** (tabela `modulos_ativos`): painel do Superadmin com switch por módulo, igual à tela de "Plugins" do WordPress. Cada rota/job de um módulo checa a flag antes de executar — desligar um módulo tem **efeito imediato, sem redeploy**.
- **Limite honesto:** adicionar um módulo **novo** (que ainda não existe no código) sempre exige escrever o código e fazer um novo deploy — isso não é simulável no Workers como é no WordPress. O sistema de flags controla **ligar/desligar módulos já existentes**, não criar módulos do nada em tempo real.
- Núcleo obrigatório (`routes/` — portal, minisite, painéis, autenticação, CRUD de anúncios) fica **fora** de `modulos/`, pois não são funcionalidades opcionais.
**Limite de tamanho por arquivo: ~500 linhas.** Arquivo se aproximando desse limite é sinal de que está fazendo coisa demais — deve ser quebrado em módulos menores (ver 7. Convenções de Código).

### 4.3 Bindings (wrangler.toml) — DECISÃO FECHADA
```toml
[[d1_databases]]
binding = "DB"
database_name = "imobiliarista-db"
database_id = "<id>"

[[r2_buckets]]
binding = "JSON_CACHE"
bucket_name = "imobiliarista-jsons"

[[routes]]
pattern = "imobiliarista.net/*"
zone_name = "imobiliarista.net"

[[routes]]
pattern = "*.imobiliarista.net/*"
zone_name = "imobiliarista.net"
```
Acesso a D1 e R2 sempre via **binding direto** (não API REST/S3 SDK externo) — mais rápido, mais barato, sem tokens expostos.

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

| Arquivo | Conteúdo | Quem consome |
|---|---|---|
| `/cidades/{cidade}.json` | Todos os imóveis ativos daquela cidade com "postar na rede" **LIGADO** | Portal Principal (`imobiliarista.net/{cidade}`) e domínios parceiros que "emprestam" a lista |
| `/corretores/{slug}.json` | **Todos** os imóveis do corretor, de qualquer cidade, incluindo os que estão com "postar na rede" desligado | Exclusivamente o Minisite do corretor (`{slug}.imobiliarista.net`) |

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

```ts
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

| Tipo de tráfego | Como é servido | Toca o Worker? |
|---|---|---|
| Visitante humano (portal ou minisite) | **Workers Static Assets** (`[assets]` no wrangler.toml, modo SPA fallback) — HTML/JS/CSS servidos de graça e ilimitado, sem invocar o script | ❌ Não |
| Robô de busca / preview (Googlebot, WhatsApp, Facebook, etc.) | Worker detecta via `User-Agent` e serve um **HTML pré-renderizado** (gerado no lote, salvo no R2) — técnica de *dynamic rendering* | ✅ Sim, mas volume baixíssimo |
| Dados de listagem (filtros, cards) | JS no navegador lê `location.hostname`/`location.pathname` e busca o **JSON direto do R2** (bypass do Worker) | ❌ Não |
| Painel do corretor/superadmin | Ações autenticadas de escrita → **Worker + D1** | ✅ Sim (esperado) |
| Geração de JSON + HTML por cidade | Processado em lote (fila/Queue), nunca por requisição individual | ✅ Sim, mas em lote, não por visita |
| Visitas repetidas do mesmo dispositivo | **Cache local via Service Worker da PWA** — Static Assets e JSONs recentes servidos direto do dispositivo, sem sair para a rede | ❌ Não (nem R2, nem Worker, nem rede) |

Resultado esperado: a esmagadora maioria do tráfego de visitante nunca invoca o Worker; a cota de 100 mil requisições/dia do plano free fica reservada quase inteiramente para o painel administrativo e a geração de dados em lote.

#### 4.6.1 Buster de cache — versionamento leve pra invalidar o cache local — DECISÃO FECHADA
**Problema que resolve:** cache agressivo (edge + Service Worker da PWA) significa que, se o corretor mudar o preço de um imóvel às 14h, o visitante que já carregou o portal pode continuar vendo a versão antiga do `cidade.json` por horas, direto do cache local do dispositivo.

**Solução:** cada arquivo-índice de cidade (`/cidades/{cidade}/_index.json`, já definido em 4.4.2) carrega um campo leve `"last_updated": <timestamp>`, atualizado a cada regeneração em lote. Ao iniciar, o JS da PWA faz um `fetch` de ~1 KB nesse índice; se o timestamp mudou em relação ao guardado localmente, o Service Worker invalida o cache do `cidade.json`/`corretor.json` correspondente e baixa a versão nova do R2. Sem esse fetch leve confirmar mudança, o cache local é mantido — minimizando tráfego desnecessário.

### 4.7 Compactação de fotos — DECISÃO FECHADA
- **Formato:** WebP (qualidade ~75-80%). Escolhido por ter suporte nativo e estável de codificação no navegador (via `Canvas`/`OffscreenCanvas`), diferente do AVIF, que comprime mais mas tem codificação client-side inconsistente entre dispositivos.
- **Onde ocorre a compressão:** inteiramente no **navegador do corretor**, antes do upload — nunca no Worker. Processar imagem no Worker arrisca estourar o limite de 10ms de CPU por invocação do plano free, e o produto oficial da Cloudflare para isso (Cloudflare Images) é pago, sem tier gratuito.
- **Resoluções geradas por foto (client-side, antes do envio):**
  - **Thumbnail** (~400px de largura) → usada nos cards de listagem.
  - **Full-size** (~1600px de largura) → usada na página do anúncio.
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

### 4.11 Integração com portais externos (ZAP, OLX, VivaReal, Chaves na Mão) — DECISÃO FECHADA — FASE 1
Recurso considerado essencial (validado por corretor experiente do mercado): hoje é padrão de mercado um site/CRM imobiliário gerar feed automático pros grandes agregadores.

**Princípio central — divisão de responsabilidade:** nosso trabalho é **disponibilizar o arquivo pronto, no formato exigido por cada serviço, numa URL estável**. O que acontece depois que o portal recebe o arquivo — quantos anúncios ele efetivamente publica, como distribui entre sub-portais — é decidido **dentro do painel/plano do próprio serviço**, fora do nosso controle e da nossa responsabilidade. Não tentamos replicar essa lógica de distribuição do lado de cá.

**Formato:** **VRSync** (formato XML unificado atual do Grupo OLX = ZAP + VivaReal + OLX). O formato antigo "ZAP" está descontinuado — **não usar** como referência de schema.

**⚠️ Correção importante sobre granularidade:** OLX, ZAP e VivaReal **não são três integrações independentes** — hoje operam como **um único agregador (Grupo OLX)**, que lê **um único arquivo XML** via uma única URL cadastrada no Canal Pro. Não existe, no schema VRSync, um campo para dizer "esse imóvel vai só pro OLX, não pro ZAP" — essa distribuição interna entre os três é decidida pelo Canal Pro, do lado deles, com base nos planos que o corretor tem contratado com cada um. **Modelo corrigido:**

| Grupo | Controle que temos | Arquivo |
|---|---|---|
| **Grupo OLX** (OLX + ZAP + VivaReal) | **Um toggle só** por anúncio ("Publicar no Grupo OLX"). **Uma cota só** (não três separadas) — o total elegível pro feed único. | Um XML VRSync por corretor |
| **Portais realmente independentes** (ImóvelWeb, Chaves na Mão, Órulo, etc.) | Cada um com **toggle e cota próprios**, por terem URL/feed genuinamente separados | Um arquivo por portal, no formato que cada um exigir (XML, CSV, JSON...) |

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

**robots.txt:** servido dinamicamente pelo Worker (varia por hostname — portal vs. minisite), com `Disallow: /painel/` e `Disallow: /api/`, `Allow: /`, e a linha `Sitemap:` apontando pro sitemap daquele host específico.

**sitemap.xml do Portal Principal:** gerado no mesmo processo em lote que já gera os JSONs/XMLs (4.4, 4.11) — não por requisição. Estrutura em **índice de sitemaps** (respeitando o limite do Google de 50.000 URLs/50 MB por arquivo):
```
/sitemap-index.xml          → aponta para os arquivos abaixo
/sitemap-cidades.xml        → URLs de /{cidade}, /{cidade}/{negocio}/{categoria}
/sitemap-anuncios-{n}.xml   → URLs de anúncios individuais, paginado por tamanho
```
**sitemap.xml de cada Minisite:** gerado no mesmo lote que o `{slug}.json` do corretor — arquivo pequeno, só com os anúncios daquele corretor.

Todos servidos como arquivo estático no R2 (mesmo domínio único já decidido em 4.11), zero invocação do Worker na leitura pelo Googlebot.

### 4.17 Anúncio vendido/removido — HTTP 410, não 404 — DECISÃO FECHADA
**Problema que resolve:** a URL de um anúncio vendido/removido (`/londrina/venda/apartamento/nome-1042`) não pode simplesmente sumir (404 é ambíguo pro Google — "não existe" vs. "não existe mais") nem continuar ativa como se nada tivesse acontecido.

**Solução:**
- Anúncio ganha um status "vendido/removido" (além do toggle "postar na rede" já existente).
- Para o **Googlebot** (já identificado via User-Agent no dynamic rendering, 4.6): a URL responde **HTTP 410 Gone**, o status correto e explícito para "isso existiu e foi removido de propósito" — ajuda o Google a desindexar mais rápido, ao contrário do 404 (ambíguo).
- Para o **visitante humano**: a mesma URL mostra uma página amigável — *"Este imóvel não está mais disponível"* + grid de anúncios semelhantes (mesma cidade/categoria, montado a partir do JSON que o navegador já tem em cache — sem requisição extra).
- O anúncio removido também **sai do sitemap.xml** na próxima geração em lote (4.16), mantendo consistência entre os dois mecanismos.

---

## 5. Modelo de Dados

### 5.1 Entidades principais (a detalhar campos)
| Entidade | Descrição |
|---|---|
| Anúncio | Imóvel cadastrado, com dados, fotos, status "na rede" (interna, padrão ligado), status por portal externo (ZAP/OLX/VivaReal/ImóvelWeb, cada um independente, padrão desligado) e status "vendido/removido" (dispara HTTP 410, ver 4.17) |
| Corretor/Usuário | Dono de um minisite e de seus anúncios. Campos imutáveis: nome completo, sexo, data de nascimento, nacionalidade, CPF (=login), CRECI. Campos editáveis: endereço residencial, telefone, e-mail, WhatsApp (ver 6.1.1) |
| Minisite | Site individual do corretor (`nome.imobiliarista.net`) |
| Cidade | Unidade de agrupamento geográfico para os JSONs |
| Plano | Limites contratados **conosco**: máx. de anúncios, máx. de fotos, permissão de API Google Maps |
| CotaPortal | Contrato do corretor **com um serviço externo** — que pode ser o **Grupo OLX** (OLX+ZAP+VivaReal, tratado como um único serviço/feed) ou um **portal independente** (ImóvelWeb, Chaves na Mão, Órulo...): quantidade de anúncios contratada (ou ilimitado), usada para limitar o arquivo gerado por serviço |
| PreCadastro | Registro pendente enviado pelo próprio corretor (nome, e-mail, telefone, CRECI), aguardando aprovação do Superadmin — não gera conta nem site até ser aprovado (ver 6.1). Inclui `aceite_termos_em` (timestamp) e `versao_termos_aceita` |

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
  ```ts
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

| Categoria | Tipos de Imóvel |
|---|---|
| Residencial | Apartamento, Área, Casa, Chácara, Cobertura, Terreno |
| Comercial | Área, Barracão, Casa, Galpão, Loja, Prédio, Sala, Salão, Terreno |
| Corporativo | Área, Barracão, Casa, Galpão, Loja, Prédio, Sala, Salão, Terreno |
| Industrial | Área, Barracão, Galpão, Salão, Terreno |
| Rural | Área, Casa, Chácara, Fazenda, Sítio, Terreno |

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
7. **Se aprovado:** Superadmin libera a conta — o subdomínio fica publicamente acessível e os anúncios já cadastrados podem ser publicados normalmente.
8. **Se reprovado:** o pré-cadastro/conta fica marcado como recusado (com motivo opcional); site permanece offline e anúncios não são liberados.

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

---

## 7. Convenções de Código

- **Idioma no código (variáveis, funções): Português (padrão Brasil) — DECISÃO FECHADA.** Nomes de variáveis, funções, tabelas e colunas do banco em português (ex: `criarAnuncio()`, `precoVenda`, tabela `anuncios`). Diferente da convenção mais comum internacionalmente (inglês), mas escolha consciente para manter o projeto 100% legível em português do início ao fim, coerente com a UI e a documentação (`project.md`).
- **Idioma na interface (UI):** Português (PT-BR)
- **Padrão de commits: Conventional Commits — DECISÃO FECHADA.** Prefixos `feat:`, `fix:`, `docs:`, `chore:`, `refactor:` (ex: `feat: adiciona toggle de portal externo no cadastro de anúncio`).
- **Padrão de nomenclatura — DECISÃO FECHADA:**
  - Arquivos/pastas: `kebab-case` (ex: `bot-detect.ts`, `zap-exporter.ts`).
  - Funções e variáveis: `camelCase`, em português (ex: `criarAnuncio`, `precoVenda`).
  - Interfaces e Types: `PascalCase`, em português (ex: `AnuncioItem`, `CorretorPerfil`).
- **Formatação/Lint: Prettier + ESLint — DECISÃO FECHADA.** Regras padrão do TypeScript para Cloudflare Workers.
- **Tamanho máximo por arquivo: ~500 linhas — DECISÃO FECHADA.** Arquivo que se aproxima desse limite deve ser quebrado em módulos menores, cada um com responsabilidade única (ex: em vez de um `painel.ts` gigante, separar `painel/anuncios.ts`, `painel/auth.ts`, `painel/conta.ts`). Facilita revisão e permite que o Claude Code edite com precisão sem varrer arquivos grandes.

---

## 8. Glossário / Índice

| Termo | Significado |
|---|---|
| Minisite | Site individual do corretor em subdomínio próprio |
| Rede | Conjunto de anúncios visíveis no portal principal e compartilháveis entre domínios |
| Postar na rede | Toggle que define se o anúncio aparece fora do minisite do corretor |
| JSON de cidade | Arquivo com todos os anúncios de uma cidade, gerado a partir do D1 e servido via R2 |
| Empréstimo de lista | Consumo do JSON de uma cidade por um domínio externo diferente do `imobiliarista.net` |

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

#### 9.2.1 Filtro avançado — base de referência
Usuário trouxe um componente HTML (busca avançada com gaveta "mais filtros") como **referência de layout e organização de campos** — sem lógica funcional real (sem JS de busca de fato, sem back-end). Pontos a corrigir ao reconstruir no padrão do projeto:
- Reescrever em **Tailwind** (o original usa CSS customizado avulso).
- Ajustar terminologia para a taxonomia fechada em 5.3 (Tipo de Negócio = Venda/Locação, categoria em 2 níveis).
- Implementar a busca de fato lendo/filtrando o JSON vindo do R2 (client-side), não como no original (função de busca inexistente).
- Manter a ideia de gaveta expansível ("mais filtros") e os campos identificados em 5.1.1.

- **Minisite do corretor:** cabeçalho com foto/bio do corretor, grid filtrado só com os anúncios dele, contato.
- **Breadcrumbs** em todas as páginas internas (Home > Londrina > Venda > Casa).

### 9.3 Identidade visual (paleta, tipografia, personalidade) — DECISÃO FECHADA
**Referência: template Houzez (WordPress)** — linguagem visual de portal imobiliário profissional já validada no mercado (a mesma referência usada pra estrutura de UI em 9.2). Na implementação, extrair/adaptar do Houzez: paleta de cores (tons neutros de base + cor de destaque para CTAs/preço), tipografia (sans-serif limpa, hierarquia clara entre título/preço/specs), estilo de card (sombra sutil, cantos arredondados, badges de Venda/Locação). Adaptar pro Tailwind (9.1), sem copiar código-fonte do Houzez (é um produto comercial licenciado) — usar como referência visual, não como base de código.

---

## 10. Roadmap de Implementação (Lotes)

> **✅ ROADMAP VERSÃO 1.0 COMPLETO** — todos os 13 lotes implementados e integrados.

> Ordem de dependência — cada lote só faz sentido depois que o anterior existir. Marcar o status conforme for avançando, para qualquer sessão (deste chat ou do Claude Code) saber exatamente onde retomar.

| # | Lote | Conteúdo | Status |
|---|---|---|---|
| 1 | Fundação | `wrangler.toml` (bindings D1/R2/Queue + rotas www/wildcard), `package.json`, `tsconfig.json`, `tailwind.config.js`, `.gitignore`, `.env.example`, `README.md`, `src/index.ts` básico | 🟢 Concluído |
| 2 | Banco de dados | Migrations `0001_init`, `0002_taxonomia`, `0003_cidades_ibge`, `0004_modulos` + `types/modelos.ts` | 🟢 Concluído |
| 3 | Autenticação | `lib/senha.ts`, `lib/cpf.ts`, `routes/api-auth.ts` (pré-cadastro + Turnstile + aceite de termos + login + recuperação), sessão via cookie | 🟢 Concluído |
| 4 | Roteamento core | `middleware/www-redirect.ts`, `middleware/bot-detect.ts`, `routes/portal.ts`, `routes/minisite.ts` | 🟢 Concluído |
| 5 | CRUD de anúncios | `routes/api-anuncios.ts`, `db/queries-anuncios.ts`, `lib/slug.ts`, `lib/sanitize.ts` | 🟢 Concluído |
| 6 | Geração em lote | `queue.ts`, `jobs/gerar-json-cidade.ts` (com particionamento), `jobs/gerar-json-corretor.ts`, `jobs/revalidacao-cruzada.ts`, `lib/r2.ts` | 🟢 Concluído |
| 7 | Frontend base | `public/index.html` (shell SPA), `assets/js/app.js`, `filtros.js`, `mapa.js` | 🟢 Concluído |
| 8 | Painel do corretor | `routes/painel-corretor.ts`, `public/painel/index.html`, `painel.js` | 🟢 Concluído |
| 9 | Painel do superadmin | `routes/painel-superadmin.ts` (aprovações, cidades, módulos on/off) | 🟢 Concluído |
| 10 | PWA | `manifest.json`, `sw.js`, `cache-buster.js` | 🟢 Concluído |
| 11 | SEO | `routes/sitemap.ts`, `jobs/gerar-sitemap.ts`, `jobs/gerar-html-snapshot.ts`, tratamento HTTP 410 | 🟢 Concluído |
| 12 | Módulos opcionais | Um de cada vez, isolados em `src/modulos/`: **Lote 12.1: feed-grupo-olx** ✓ (xml VRSync, vrsync-mapper, gerador, rota, integração queue) · **Lote 12.2: feed-portais-independentes** ✓ (gerador extensível, rota, integração queue, tabela portais_independentes, queries superadmin) · **Lote 12.3: busca-ia** ✓ (logica.ts, rota.ts, binding AI em wrangler.toml, rota em index.ts, docs/configuracao-cloudflare.md, public/assets/js/busca-ia.js) · **Lote 12.4: video-youtube** ✓ (logica.ts com getYouTubeId, video-player.js, integração em app.js, suporte em jobs gerar-json, respeitando flag modulos_ativos) · **Lote 12.5: tour-360** ✓ (rota.ts com validação de URL, tour-360-player.js, integração em app.js, suporte em jobs gerar-json, respeitando flag modulos_ativos) · **Lote 12.6: busca-salva-email** ✓ (migration 0008, rota.ts com endpoints salvar/cancelar, logica.ts com correspondência anúncio×busca, queries-buscas-salvas.ts, integração em index.ts, botão UI em public/assets/js/busca-salva-email.js, respeitando flag modulos_ativos) · **Lote 12.7: agendamento-visita** ✓ (migration 0009, rota.ts com endpoints solicitar/listar/confirmar/recusar, logica.ts com envio de e-mails Resend, queries-agendamentos.ts, integração em index.ts e painel-corretor.ts, respeitando flag modulos_ativos) · **Lote 12.8: comparacao-anuncios** ✓ (rota.ts com validações, public/assets/js/comparacao-anuncios.js 100% client-side, estado em memória, tabela comparativa lado a lado, integração em index.html e app.js, respeitando flag modulos_ativos) · **Lote 12.9: calculadora-financiamento** ✓ (rota.ts com cálculo SAC, calculadora-financiamento.js 100% client-side, widget em detail-view, integração em app.js, respeitando flag modulos_ativos) | 🟢 Concluído |
| 13 | Backup/observabilidade | `scheduled.ts` (Cron Trigger mensal export D1→R2) + `wrangler.toml` (cron schedule) + `docs/observabilidade.md` (guia manual para Time Travel, Rate Limiting, métricas, alertas) | 🟢 Concluído |

---

## 11. Histórico de Decisões

| Data | Decisão | Motivo |
|---|---|---|
| Sessão inicial | Repositório criado em github.com/Imobiliarista/Portal, conectado ao Cloudflare Pages/Workers | Base técnica do projeto |
| Sessão inicial | Stack: Cloudflare Workers + D1 + R2, frontend HTML+JS simples | Minimizar custo/complexidade, maximizar uso do free tier |
| Sessão inicial | JSON por cidade servido via R2, bypassando o Worker | Evitar consumo do limite mais apertado (Workers: 100K req/dia) |
| Sessão inicial | Sistema de planos/limites incluído desde a fase 1 | Necessidade técnica para controlar custo de storage (R2) e escrita (D1), não é feature de cobrança |
| Sessão inicial | Cobrança via Asaas adiada para fase futura | Foco em validar o produto primeiro (6 meses grátis para corretores) |
| Sessão inicial | Fila de alterações em lote no painel | Reduzir número de requisições individuais ao D1/R2 |
| Sessão inicial | PWA incluída na fase 1; chat interno substituído por WhatsApp por anúncio | Baixo custo de infraestrutura, melhor experiência |
| Sessão inicial | Implementação via **Worker puro** (não Cloudflare Pages/Pages Functions) | Pages não suporta subdomínio wildcard dinâmico de forma nativa e confiável (confirmado na documentação/comunidade oficial da Cloudflare) |
| Sessão inicial | DNS `*.imobiliarista.net` obrigatoriamente proxied (nuvem laranja) | Sem proxy, o Worker nunca intercepta a requisição — nuvem cinza inviabiliza toda a arquitetura |
| Sessão inicial | Regeneração do JSON de cidade desacoplada da requisição de escrita individual (via `waitUntil`/Queue) | Evitar estourar o limite de CPU por invocação do Worker no plano free e manter a fila de lote funcional |
| Sessão inicial | Rotas do Worker cobrindo domínio raiz E wildcard separadamente (`imobiliarista.net/*` + `*.imobiliarista.net/*`) | Wildcard sozinho não cobre o domínio raiz |
| Sessão inicial | Remoção automática de "www." (301) para domínio raiz e qualquer subdomínio, como primeira etapa do `fetch()` | URLs limpas e consistentes em toda a rede |
| Sessão inicial | Tráfego de visitante servido via Workers Static Assets (SPA), com dynamic rendering só para bots e cache local via PWA | Manter consumo de Workers próximo de zero, preservando SEO |
| Sessão inicial | Fotos compactadas em WebP no navegador do corretor (não no Worker), em duas resoluções (thumbnail + full-size) | Evitar estourar CPU do Worker free e evitar dependência do Cloudflare Images (pago) |
| Sessão inicial | Entrega dos JSONs comprimida automaticamente via Brotli da Cloudflare (sem compressão manual no código) | Reduzir dados consumidos pelo visitante sem complexidade/manutenção extra |
| Sessão inicial | `db.batch()`, índices no D1, sem foto original no R2, painel como Static Asset, alertas de uso | Espremer ainda mais a permanência no plano free |
| Sessão inicial | Upgrade pago do Workers ($5/mês) aceito como rede de segurança, não como ponto de partida | Crescer sem susto financeiro só quando o volume real justificar |
| Sessão inicial | Tailwind CSS como única ferramenta de estilo (sem Bootstrap junto) | Evitar conflito de resets/especificidade e peso duplicado |
| Sessão inicial | Estrutura de UI definida no padrão "estilo Houzez" (seção 9.2) | Referência de mercado para portal de anúncios de imóveis |
| Sessão inicial | OpenStreetMap + Leaflet.js como mapa padrão (gratuito); Google Maps API só como opção premium com chave do corretor | Evitar custo/risco de cobrança do Google Maps por padrão |
| Sessão inicial | Geolocalização via API nativa do navegador | Sugerir cidade mais próxima sem custo de servidor |
| Sessão inicial | Módulo Asaas implementado em sandbox desde já; cobrança real adiada para fase 3 | Deixar a integração pronta sem gerar cobrança precoce |
| Sessão inicial | Incluídos na fase 1: campos personalizados/comodidades, busca salva/alerta por e-mail, agendamento de visita, comparação entre anúncios, calculadora de financiamento | Aproximar do nível "Houzez" sem os módulos mais pesados |
| Sessão inicial | Adiados para fase 2: captura de leads + gestão de contatos (CRM-lite) e insights/analytics de desempenho | Evitar processamento/armazenamento adicional na fase inicial |
| Sessão inicial | Taxonomia de categorias fechada: Tipo de Negócio (Venda, Locação — sem Temporada) e 5 categorias (Residencial, Comercial, Corporativo, Industrial, Rural) com seus tipos de imóvel | Base para URLs, filtros e cadastro de anúncio |
| Sessão inicial | Árvore de diretórios completa definida (seção 4.2), incluindo arquivos de governança (README, .gitignore, .env.example, CI) | Base para os primeiros lotes de código no Claude Code |
| Sessão inicial | Limite de ~500 linhas por arquivo | Facilitar revisão e edição precisa pelo Claude Code |
| Sessão inicial | JSON duplo por Cidade e por Corretor (4.4.1) | Corretor não fica limitado a uma cidade só; isolamento de visibilidade entre rede e minisite |
| Sessão inicial | Feed XML formato VRSync por corretor, incluído na Fase 1 (4.11), gerado no mesmo lote dos JSONs, domínio único do R2, toggle de rede externa independente do toggle de rede interna | Padrão de mercado validado por corretor experiente; custo adicional próximo de zero |
| Sessão inicial | Toggle de portal externo nasce **desligado** por padrão (diferente do toggle interno "postar na rede", que nasce ligado); filtragem de cota acontece **antes** do envio, nunca no lado do portal; contador visível de cota usada no painel | Evitar estouro de cota contratada com o portal sem o corretor perceber; comportamento validado com base em Kenlo/ImobiBrasil |
| Sessão inicial | Seletor numérico de cota é **por portal** (uma linha por portal em "Configurações do Site → Portais Integrados"), nunca um limitador único global | Cada portal tem contrato/preço próprio; limitador global aplicaria o número errado a portais diferentes |
| Sessão inicial | **Correção:** OLX/ZAP/VivaReal tratados como **um único serviço (Grupo OLX)** — um toggle, uma cota, um arquivo VRSync — não três integrações separadas. Distribuição interna entre os três é decidida pelo Canal Pro, fora do nosso controle. Portais genuinamente independentes (ImóvelWeb, Chaves na Mão, etc.) mantêm toggle/cota/arquivo próprios | O schema VRSync não tem campo para direcionar um anúncio a um sub-portal específico do grupo; nosso papel é só disponibilizar o arquivo certo, no formato certo, por serviço |
| Sessão inicial | Queue processa **uma mensagem por arquivo** (JSON cidade, JSON corretor, XML Grupo OLX, XML por portal independente), nunca uma mensagem única que gera todos os arquivos de um corretor de uma vez | Evitar estourar o limite de 10ms de CPU por invocação do Worker conforme cresce o número de portais/formatos gerados por corretor |
| Sessão inicial | Particionamento automático do JSON de cidade (4.4.2): corte por tamanho comprimido (~1 MB), não por contagem; ordem Negócio → Categoria → Tipo → Região → Paginação; arquivo-índice por cidade; foto de capa única na listagem (galeria completa só no anúncio individual) | Simulação de mega-cidade (600 mil anúncios) mostrou que um arquivo único chegaria a ~35 MB comprimidos — inviável; solução escala automaticamente sem overhead em cidades pequenas/médias |
| Sessão inicial | Onboarding de corretor sem autosserviço (6.1): só Superadmin cadastra conta, atribui subdomínio, verifica CRECI e libera; convite de senha só depois da aprovação | Rede controlada, alinhado ao modelo de negócio (não plataforma aberta) |
| Sessão inicial | **Correção:** onboarding permite **pré-cadastro público** feito pelo próprio corretor (nome, e-mail, telefone, CRECI) — mas isso só entra numa fila de aprovação no painel do Superadmin, não cria conta/site sozinho. Conta e subdomínio só existem após aprovação manual | Reduz trabalho manual do Superadmin (não precisa digitar tudo), mantendo o controle de aprovação e verificação de CRECI |
| Sessão inicial | Autenticação (6.2): senhas com PBKDF2 (Web Crypto API nativo) + salt, armazenadas no D1 (não KV), sessão via cookie HttpOnly/Secure/SameSite, e-mails transacionais via Resend (sem cartão de crédito), 2FA obrigatório pro Superadmin | KV tem consistência eventual e limite de escrita baixo demais para login; D1 resolve ambos e já é usado no resto do sistema |
| Sessão inicial | **Correção:** conta e acesso ao painel liberados **imediatamente** no pré-cadastro (corretor já define a própria senha ali, sem convite posterior); porém **site fica offline e anúncios não são publicados** até o Superadmin aprovar (verificar CRECI) e liberar a conta | Corretor pode ir se organizando/completando dados enquanto aguarda aprovação, sem ficar bloqueado, mas sem exposição pública indevida antes da checagem |
| Sessão inicial | Campos do cadastro divididos em imutáveis (nome completo, sexo, data de nascimento, nacionalidade, CPF, CRECI) e editáveis (endereço, telefone, e-mail, WhatsApp); login é **nome de usuário OU CPF** (só números) + senha | Dados de identidade civil/profissional não devem mudar sem processo de suporte; CPF sempre válido como login, nome de usuário como alternativa mais fácil de lembrar |
| Sessão inicial | IA (Cloudflare Workers AI, free tier) como assistente de busca em linguagem natural **só no Portal Principal**, nunca nos minisites (4.12); geração automática de descrição de anúncio via IA descartada | No minisite o corretor já é quem atende — IA ali competiria com o próprio papel dele; no portal não há corretor único, a IA vira a "corretora virtual" da rede; descrição fixa gerada por IA criaria conteúdo duplicado entre cidade.json e corretor.json (problema de SEO) |
| Sessão inicial | Catálogo de cidades pré-carregado do IBGE (5.4): 5.570 municípios, hierarquia Brasil→Estado→Cidade, com lat/long; sem "liberação de cidade" por pedido — controle real é sobre o corretor (CRECI por estado); JSON de cidade só existe quando há conteúdo real | Evita gargalo manual e evita bagunça de nomes de cidade digitados livremente; fonte oficial e gratuita já cobre 100% dos casos reais |
| Sessão inicial | Geolocalização do visitante (`navigator.geolocation`) comparada com lat/long do catálogo IBGE, no próprio navegador, para sugerir/pré-preencher a cidade mais próxima no filtro da home | Sem custo de servidor, sem API paga de geocoding — usa dado que já está no catálogo |
| Sessão inicial | Vídeo do YouTube nos anúncios (5.1.2): extração de ID limpo, embed via `youtube-nocookie.com` com só parâmetros que ainda funcionam (`rel=0`, `playsinline`, `controls`); **descartadas** técnicas de CSS masking pra esconder marca do YouTube e qualquer tentativa de "bloqueio de propaganda" | `modestbranding`/`showinfo` descontinuados desde 2023 (sem efeito); masking viola diretrizes de marca do YouTube; bloqueio de anúncio é tecnicamente impossível via embed hoje |
| Sessão inicial | Identidade visual baseada no template Houzez (9.3); sistema de imobiliárias multi-corretor descartado definitivamente; idioma do código em Português; fila/lote definida como Cloudflare Queues (não Durable Objects) | Queues já faz nativamente a agregação de lote via `max_batch_size`/`max_batch_timeout`, sem precisar de coordenação manual; demais pontos fecham pendências abertas anteriormente |
| Sessão inicial | Backup/DR do D1 (4.13): Time Travel nativo (30 dias, automático, grátis) como camada principal + export mensal pro R2 como reforço de retenção longa | Time Travel já resolve o cenário mais comum sem configuração; export complementa pra além de 30 dias |
| Sessão inicial | Verificação de CRECI confirmada como processo manual, consultado pessoalmente pelo Superadmin no site oficial do CRECI — sem integração automatizada | Decisão do usuário; simplicidade na fase 1 |
| Sessão inicial | 5 melhorias de fechamento pré-v1.0: (1) revalidação cruzada corretor+cidade no toggle de rede (4.4.1.1); (2) buster de cache via timestamp no índice de cidade (4.6.1); (3) padrão de URL slug+ID do anúncio (4.14); (4) normalização/sanitização de strings na entrada, incluindo remoção de emoji antes do XML (4.15); (5) fechamento total da seção 7 (Conventional Commits, kebab-case/camelCase/PascalCase, Prettier+ESLint) | Revisão de arquitetura antecipando gargalos de implementação; elimina todas as pendências abertas do documento |
| Sessão inicial | **`project.md` promovido de v0.2 (Em definição) para v1.0 (Aprovado)** — nenhuma pendência "a definir" restante no documento | Base pronta para iniciar a implementação via Claude Code |
| Sessão inicial | 5 fechamentos de SEO/segurança pós-v1.0: (1) sitemap.xml em índice + robots.txt dinâmico por hostname (4.16); (2) anúncio vendido/removido responde HTTP 410 pra bots + página de similares pra humanos (4.17); (3) aceite explícito de Termos/Privacidade com timestamp e versão no D1 (6.1); (4) Cloudflare Turnstile no pré-cadastro contra spam (6.1); (5) Rate Limiting Rule por IP na rota de busca por IA, protegendo a cota diária de Neurons (4.12) | Fecha lacunas que só apareceriam depois de já estar em produção — SEO só funciona se o Google descobre e entende corretamente as URLs; segurança do cadastro e da cota de IA evita abuso desde o primeiro dia |
| Sessão inicial | Árvore de diretórios revisada (4.2) com sistema de módulos ativáveis/desativáveis via painel (4.2.1) — `src/modulos/` para funcionalidades opcionais (IA, feeds, vídeo, tour 360°, busca salva, agendamento, comparação, calculadora), com flags no D1; núcleo obrigatório fica fora dos módulos. Nomenclatura de arquivos corrigida de camelCase para kebab-case (alinhando com a seção 7) | Inspirado em plugins do WordPress, adaptado à realidade do Workers (bundle compilado no deploy — módulo novo sempre exige deploy, mas ligar/desligar módulo existente é imediato via flag) |
