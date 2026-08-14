# Relatório — Auditoria "zero D1 no pageview público"

Data: 14/08/2026
Referência: Documento Técnico de Implantação Edge-First (seções 2 e 14),
regras de projeto adicionadas na seção 21.

## Método

Leitura direta do código-fonte (`src/`), sem suposição — cada achado abaixo
é uma citação de arquivo/linha real do projeto no estado em que foi
enviado. A correção foi feita em duas rodadas:

1. Rodada original (sandbox sem rede): typecheck feito com um stub
   aproximado de `@cloudflare/workers-types`, sem validação real.
2. Rodada de aplicação (este commit, ambiente com rede/repo real):
   `npm ci`, `npm run typecheck`, `npm run lint` e `npm audit` rodados de
   verdade contra o `@cloudflare/workers-types` real. Resultados na seção
   "Validação real" abaixo.

## Achados

### 1. CORRIGIDO — `routes/minisite.ts`: 2 consultas D1 em TODO pageview de visitante de tenant

Antes: `buscarCorrelorPorSlug` + `estaMinisiteLiberado`, ambas em D1, executadas
a cada requisição de qualquer visitante de `*.imobiliarista.net` — antes até
de servir o shell estático. Este era o achado mais grave: afeta 100% do
tráfego humano dos minisites, não só bots.

Correção: novo job `jobs/gerar-status-minisite.ts` materializa
`tenants/{slug}/status.json` (existe + liberado) em R2, disparado nos dois
pontos reais em que o status muda — criação do pré-cadastro
(`routes/api-auth-cadastro.ts`) e aprovação pelo superadmin
(`db/queries-superadmin.ts` + `routes/painel-superadmin.ts`, que agora
propaga o slug aprovado). `routes/minisite.ts` passou a ler só R2.

### 2. CORRIGIDO — `middleware/bot-detect.ts`: D1 a cada requisição de bot/crawler num anúncio

Antes: `renderizarParaBot` consultava D1 diretamente. O filtro de bot é
largo (`/bot/i`, `/crawler/i`, `/spider/i`, `/curl/i`, `/wget/i`), então
qualquer scanner automatizado também disparava.

Correção: novo job `jobs/gerar-json-anuncio.ts` materializa
`anuncios/{id}.json` em R2 a cada mutação de anúncio (plugado no ponto
único já existente `enfileirarRevalidacaoDoAnuncio`,
`jobs/revalidacao-cruzada.ts`). `bot-detect.ts` passou a ler R2; se o
artefato ainda não existir (corrida entre criação e a fila processar), cai
no shell normal via Static Assets — nunca num acesso a D1.

### 3. CORRIGIDO (parcial) — `modulos/feed-grupo-olx/rota.ts` e `modulos/feed-portais-independentes/rota.ts`

Antes: `buscarCorrelorPorSlug` em D1 a cada requisição das rotas públicas
`/feeds/grupo-olx/*.xml` e `/feeds/*/*.{xml,csv,json}` (roteadas
diretamente em `src/index.ts`), só para resolver `corretor_id` a partir do
slug.

Correção: as duas rotas passaram a ler `tenants/{slug}/status.json`
(o mesmo artefato do item 1, já materializado por
`jobs/gerar-status-minisite.ts`) para obter `corretor_id`, em vez de
consultar D1. `estaModuloAtivo` e `buscarCotaPortal` continuam em D1
nessas rotas — ver nota abaixo.

### 4. NÃO CORRIGIDO — `modulos/publicacoes/rota.ts`

`verificarElegibilidadePublicacoes(env.DB, hostname)` roda a cada acesso
a `/publicacoes*` de um minisite e continua em D1.

Motivo de não corrigir agora: ao contrário dos itens 1–3, a elegibilidade
de Publicações depende de três fontes que mudam de forma independente —
flag do módulo em nível de rede (`modulos_ativos`), o plano do corretor
(`plano_id` → `permite_publicacoes`) e o opt-in do próprio corretor
(`config_modulos.publicacoes`, alterável a qualquer momento pelo painel do
corretor). Materializar isso em R2 corretamente exigiria plugar
invalidação em pelo menos três pontos de mutação distintos (troca de
plano no superadmin, alternância do módulo em nível de rede — que afeta
todos os tenants de uma vez — e salvamento da config do corretor), cada um
já implementado num arquivo diferente, e testar as combinações. Risco de
introduzir uma janela de inconsistência (módulo continua "elegível" em
cache depois de um downgrade de plano, por exemplo) é maior que o ganho,
dado que é a rota de menor tráfego das três. Fica registrado como
pendência explícita para uma tarefa dedicada.

### Nota sobre `estaModuloAtivo` e `buscarCotaPortal` nas rotas de feed

Os itens 3 fecham especificamente o `buscarCorrelorPorSlug` (o achado
citado na auditoria original). As mesmas rotas ainda chamam
`estaModuloAtivo(env.DB, ...)` e `buscarCotaPortal(env.DB, ...)` — dois
D1 reads adicionais por requisição, fora do escopo desta auditoria (que
citava apenas `buscarCorrelorPorSlug`). Mesmo padrão de correção se
aplicaria a esses dois se/quando entrarem em escopo.

## Validação real (rodada de aplicação — ambiente com rede/repo)

- `node --version`: v22.22.2 (Node 22 confirmado).
- `npm ci`: OK, 224 pacotes instalados.
- `npm run typecheck`: **58 erros pré-existentes na baseline** (branch
  `main`, antes desta correção — confirmado rodando `tsc --noEmit` na
  baseline via `git stash`), nenhum nos arquivos tocados por esta tarefa.
  A correção desta tarefa não introduziu nenhum erro novo — e eliminou 2
  erros pré-existentes em `middleware/bot-detect.ts` como efeito colateral
  (a consulta D1 removida tinha um cast de tipo incorreto). Os 58 erros
  remanescentes são de código não tocado por esta tarefa (queries D1 sem
  tipagem forte, `process` sem `@types/node`, etc.) — problema real do
  projeto, mas pré-existente e fora do escopo desta correção; recomenda-se
  uma tarefa dedicada de saneamento de tipos.
- `npm run lint`: **falha antes mesmo de rodar** — não existe
  `eslint.config.js` no repositório (ESLint 9 exige o formato flat
  config; o projeto nunca teve um). Confirmado que a mesma falha ocorre
  na baseline (`main`), sem relação com esta correção. Fora do escopo
  desta tarefa introduzir a configuração do zero.
- `npm test`: não há script `test` no `package.json` nem framework de
  teste instalado (sem `vitest`/`jest` em `devDependencies`, nenhum
  arquivo `*.test.ts`/`*.spec.ts` no projeto). Escrever um teste mínimo
  para `gerar-status-minisite.ts`/`gerar-json-anuncio.ts` exigiria
  primeiro montar toda a infraestrutura de teste do zero — decisão de
  ferramental maior que o escopo desta correção pontual. Fica registrado
  como recomendação, não como pendência desta tarefa.
- `npm audit --audit-level=moderate`: 7 vulnerabilidades (2 moderate, 5
  high), todas em dependências de desenvolvimento (`wrangler` e sua
  cadeia: `esbuild`, `miniflare`, `sharp`, `undici`, `ws`, `nanoid`).
  Correção completa exige `npm audit fix --force`, que sobe `wrangler`
  para 4.x (breaking change) — fora do escopo desta correção; nenhuma
  dessas vulnerabilidades foi introduzida por este trabalho.
- `wrangler.toml`: não foi alterado por esta correção — dry-run de deploy
  não é necessário (critério do próprio pedido).

## O que ainda falta pra fechar o Documento Técnico Edge-First

- Item 4 acima (`modulos/publicacoes/rota.ts`).
- Saneamento dos 58 erros de typecheck pré-existentes (fora do escopo
  desta tarefa, mas real e crescente).
- Configuração do ESLint (`eslint.config.js`) — não existe no projeto.
- Decisão sobre framework de testes (nenhum instalado hoje).
- `npm audit fix --force` (upgrade de `wrangler` — avaliar separadamente,
  é breaking change).
- Toda a parte de Dashboard Cloudflare (Origin Rules, wildcard DNS, R2
  Custom Domains, Redirect Rule www) — fora do escopo de código, roteiro
  já descrito no Documento Técnico v2, seções 4/5/9/10/13.
- Conflito de precedência Route × Origin Rule (seção 13, passo 7 do
  Documento Técnico v2) continua bloqueando o teste do Plano A em
  produção até ser resolvido no Dashboard.
