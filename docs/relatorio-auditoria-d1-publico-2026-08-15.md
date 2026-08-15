# Relatório — Auditoria "zero D1 no caminho público" (pós-cache de borda, PR #41)

Data: 15/08/2026
Referência: Documento Técnico de Implantação Edge-First (seções 2 e 14);
segue diretamente `docs/relatorio-auditoria-d1-publico-2026-08-14.md`.

## Método

Leitura direta do código-fonte (`src/`), sem suposição. Duas frentes:

1. Verificação pontual dos 5 arquivos do caminho crítico de pageview —
   `src/index.ts`, `src/routes/portal.ts`, `src/routes/minisite.ts`,
   `src/middleware/bot-detect.ts`, `src/lib/edge-cache.ts` — incluindo o
   fluxo introduzido no PR #41 (cache de borda + `run_worker_first`
   restrito por rota).
2. Varredura ampla (`grep env\.DB` em `src/`) de todo o projeto, com
   classificação de cada um dos 29 arquivos encontrados em: (a) painel-
   corretor autenticado, (b) painel-superadmin autenticado, (c) job/queue
   (escrita assíncrona), (d) qualquer coisa fora dessas três categorias.

Binding real de D1 confirmado em `wrangler.toml`: `env.DB` (linha do
bloco `[[d1_databases]]`, `binding = "DB"`).

## Parte 1 — Caminho crítico de pageview (portal + minisite + cache de borda)

**Resultado: limpo. Nenhum dos 5 arquivos importa ou chama `env.DB`.**

- `src/index.ts` (`src/index.ts:150-187`) — o dispatcher `despachar()` só
  decide entre `rotasMinisite`/`rotasPortal` por hostname. O fluxo de
  cache (Prioridade 1) faz `caches.default.match` antes de chamar
  `despachar()`; em **hit**, nada abaixo roda — nem bot-detect, nem
  `env.ASSETS.fetch`, nem R2 (`src/index.ts:170-174`, comentário confirma
  isso explicitamente). Em **miss**, `despachar()` é chamado — ou seja, o
  caminho pós-miss é exatamente `rotasPortal`/`rotasMinisite`, que também
  não tocam D1 (ver abaixo). A gravação no cache (`gravarNoCacheDeBorda`)
  também não toca D1 — só manipula `Response`/`Headers` e escreve na Cache
  API.
- `src/routes/portal.ts` — só chama `ehBot`/`renderizarParaBot`
  (bot-detect) e `env.ASSETS.fetch(request)`. Nenhuma referência a `DB`.
- `src/routes/minisite.ts:50-53` — lê exclusivamente
  `env.DADOS_CACHE` (R2) via `lerJSON(env.DADOS_CACHE, "tenants/{slug}/status.json")`
  para decidir existência/liberação do minisite. Nenhuma referência a `DB`.
- `src/middleware/bot-detect.ts:57-60` — `renderizarParaBot` lê
  `env.DADOS_CACHE` (`anuncios/{id}.json`); se o artefato não existir,
  retorna `null` e quem chamou cai no shell via Static Assets — nunca em
  D1. Nenhuma referência a `DB`.
- `src/lib/edge-cache.ts` — só monta chave de cache e grava/lê na Cache
  API nativa do Workers (`caches.default`). Nenhuma referência a `env`
  sequer.

`src/routes/minisite.ts` e `src/routes/portal.ts` leem exclusivamente
`env.DADOS_CACHE` (R2) e `env.ASSETS` para qualquer dado que compõe a
resposta ao visitante — não há flag, condicional ou fallback que abra uma
consulta a D1 nesses dois arquivos.

## Parte 2 — Varredura ampla e classificação

29 arquivos referenciam `env.DB` no projeto. Classificação:

### (a) Painel-corretor autenticado — OK
`routes/painel-corretor.ts`, `routes/api-anuncios-crud.ts`,
`routes/api-anuncios-listagem.ts`, `routes/api-anuncios-backup.ts`,
`lib/sessao.ts` (helper `obterCorretorAutenticado`, usado por essas
rotas). Todas exigem sessão válida de corretor (cookie `session_id`
validado contra D1) antes de qualquer outra consulta — inclusive
`lib/sessao.ts:19-23`, que é a própria checagem de sessão.

### (b) Painel-superadmin autenticado — OK
`routes/painel-superadmin.ts`, `routes/painel-superadmin-isencao.ts`,
`routes/painel-superadmin-planos.ts`, `lib/painel-admin-auth.ts` (helper
`obterSuperadminIdDaSessao`). Mesmo padrão: sessão validada contra D1
antes de prosseguir.

### (c) Job/queue (escrita assíncrona) — OK
`jobs/gerar-json-anuncio.ts`, `jobs/gerar-status-minisite.ts`,
`jobs/revalidacao-cruzada.ts`, `jobs/gerar-json-cidade.ts`,
`jobs/gerar-json-corretor.ts`, `jobs/gerar-sitemap.ts`,
`modulos/feed-grupo-olx/gerador.ts`,
`modulos/feed-portais-independentes/gerador.ts`, `scheduled.ts`.
Confirmado via `src/queue.ts` (consumer da fila,
`processarFilaAlteracoes`) e `src/scheduled.ts` (cron mensal) que nenhum
desses é chamado de forma síncrona a partir de uma requisição de
visitante — só do handler `queue()`/`scheduled()` do Worker
(`src/index.ts:190-198`).

### (d) Fora das três categorias — achados

Todos os itens abaixo consultam `env.DB` de forma síncrona dentro do
tratamento de uma requisição HTTP que **não** é painel autenticado nem
job/queue. Estão ordenados por severidade real (alcance de tráfego), não
por ordem alfabética — a categorização "(d) = crítico" do escopo desta
tarefa é binária, mas o impacto pra "zero D1 no pageview público" varia
bastante entre eles, então a leitura abaixo separa isso.

#### D1‑1 (mais grave — afeta ~100% do tráfego, todo pageview) — `modulos/pwa/rota.ts`

`/manifest.json` e `/sw.js` são buscados automaticamente pelo navegador
em **toda** carga de página: `public/index.html:10` tem
`<link rel="manifest" href="/manifest.json">` e
`public/assets/js/cache-buster.js:123` chama
`navigator.serviceWorker.register('/sw.js')` — esse shell é o mesmo
servido tanto no portal quanto em todo minisite liberado. Ou seja,
diferente dos itens já corrigidos no relatório de 14/08 (que eram sobre o
HTML da página em si), este é um request companion disparado pelo
próprio navegador em paralelo a toda visita — mas ainda assim visitante
público, sem sessão, sem cache de borda (index.ts não passa `/manifest.json`
nem `/sw.js` por `rotasPortal`/`rotasMinisite`, mas eles seguem elegíveis
ao cache de borda por não começarem com `/painel`; ainda assim rodam D1
**a cada miss de cache**, que é frequente dado o `no-cache` do SW).

Consultas D1 síncronas por requisição:
- `modulos/pwa/rota.ts:54` — `estaModuloAtivo(env.DB, "pwa")` (domínio raiz, manifest)
- `modulos/pwa/rota.ts:76` — `verificarElegibilidadePwa(env.DB, hostname)` (minisite, manifest)
- `modulos/pwa/rota.ts:95` — `estaModuloAtivo(env.DB, "pwa")` (domínio raiz, service worker)
- `modulos/pwa/rota.ts:108` — `verificarElegibilidadePwa(env.DB, hostname)` (minisite, service worker)
- `modulos/pwa/rota.ts:170`, `:197`, `:267` — `verificarElegibilidadePwa(env.DB, url.hostname)` em `/apps`, `/apps/android`, `/apps/iphone`

O comentário em `pwa/rota.ts:69-75` já reconhece isso como decisão
deliberada ("checagem de elegibilidade ao vivo") pra evitar servir
manifest desatualizado após downgrade de plano — é uma troca consciente
de consistência por isolamento, mas não estava documentada como exceção
à regra "zero D1 no pageview público" em nenhum dos relatórios/documento
técnico revisados.

#### D1‑2 (minisite, sob path routing) — `modulos/publicacoes/rota.ts:34`

Já identificado no relatório de 14/08 como item 4, **não corrigido**:
`verificarElegibilidadePublicacoes(env.DB, url.hostname)` roda a cada
acesso a `/publicacoes` e `/publicacoes/{id}` de qualquer minisite
(chamado direto por `routes/minisite.ts:71-73`, antes do
`env.ASSETS.fetch`). Continua pendente pelo mesmo motivo já documentado
(elegibilidade depende de três fontes de mutação independentes — flag de
rede, plano do corretor, opt-in do corretor).

#### D1‑3 (feeds — consumidores externos, não navegador humano) — `modulos/feed-grupo-olx/rota.ts` e `modulos/feed-portais-independentes/rota.ts`

Já citado como "Nota" no relatório de 14/08 (fora do escopo daquela
tarefa, que cobria só `buscarCorrelorPorSlug`). Continua em D1 hoje:
- `feed-grupo-olx/rota.ts:32` — `estaModuloAtivo(env.DB, "feed-grupo-olx")`
- `feed-grupo-olx/rota.ts:49` — `buscarCotaPortal(env.DB, status.corretor_id, "grupo-olx")`
- `feed-portais-independentes/rota.ts:42` — `estaModuloAtivo(env.DB, "feed-portais-independentes")`
- `feed-portais-independentes/rota.ts:60` — `buscarCotaPortal(env.DB, status.corretor_id, portalSlug)`

Tráfego é de leitores de feed/portais parceiros, não de visitante humano
navegando o site — impacto de escala menor que D1‑1/D1‑2, mas ainda uma
consulta D1 síncrona numa rota pública sem sessão.

#### D1‑4 (ações públicas pontuais, disparadas por interação explícita do visitante)

Diferem dos itens acima porque só executam quando o visitante realiza uma
ação específica (não em toda carga de página) — mas ainda são handlers
públicos sem sessão que tocam D1 de forma síncrona, fora de (a)/(b)/(c):

- `modulos/busca-ia/rota.ts:29` — `estaModuloAtivo(env.DB, "busca-ia")`, a cada `POST /api/busca-ia`.
- `modulos/busca-salva-email/rota.ts:35` — `estaModuloAtivo(env.DB, "busca-salva-email")`; `:97` `criarBuscaSalva`; `:149` `obterBuscaPorToken`; `:180` `cancelarBuscaSalva` — rotas de salvar/cancelar busca, sem login (cancelamento é via token, LGPD).
- `modulos/agendamento-visita/rota.ts:39` — `estaModuloAtivo(env.DB, "agendamento-visita")`, checado mesmo na rota pública `solicitar`; `:131` e `:163` — dois `env.DB.prepare(...)` inline (busca de anúncio e de corretor) dentro de `tratarSolicitar` (`POST /api/agendamento/solicitar`, pública, linha 48); `:146` — `criarAgendamento(env.DB, ...)`. (As demais ocorrências do arquivo — `:201, 225, 241, 251, 257, 298, 314, 324, 330` — estão em `tratarListar`/`tratarConfirmar`/`tratarRecusar`, todas atrás de `sessaoCorretorId`, ou seja, categoria (a) de fato.)

#### D1‑5 (ações de autenticação — pré-sessão, esperado)

`routes/api-auth-cadastro.ts`, `routes/api-auth-login.ts`,
`routes/api-auth-recuperacao.ts` consultam D1 diretamente (verificação de
e-mail/CPF/CRECI duplicado, criação de conta, checagem de senha, criação/
validação/revogação de sessão, tokens de recuperação). Tecnicamente não
se encaixam em (a)/(b) — o visitante ainda não tem sessão — nem em (c).
Diferente dos itens D1‑1 a D1‑4, porém, isso é esperado e inevitável: são
ações de autenticação por definição (não há como logar/cadastrar/recuperar
senha sem consultar a fonte da verdade), disparadas só por submissão
explícita de formulário, nunca por um GET de navegação passiva. Registrado
aqui só pra completar a varredura solicitada — não recomendo tratamento
como os demais achados desta seção.

## Conclusão

**A regra "zero D1 no pageview público" continua válida para o núcleo do
fluxo de renderização** (`index.ts` → cache de borda → `portal.ts` /
`minisite.ts` → bot-detect) e para o que roda depois de um cache miss —
incluindo o fluxo novo do PR #41. Isso é o que a Parte 1 confirma sem
ressalvas.

Só que "caminho público" é mais largo que só esse núcleo: existem 4 achados
(D1‑1 a D1‑4) de rotas públicas sem sessão, fora de (a)/(b)/(c), que
seguem consultando D1 de forma síncrona a cada requisição. D1‑1
(`pwa/rota.ts`) é o mais sério: afeta virtualmente 100% dos carregamentos
de página (não só o HTML, mas o par manifest+service-worker que todo
navegador busca em paralelo), no portal e em todo minisite — mesma classe
de risco dos itens já corrigidos em 14/08, e não estava coberto por
aquela auditoria (que citava só o HTML servido por `minisite.ts` e
`bot-detect.ts`). D1‑2 e D1‑3 já eram conhecidos e permanecem pendentes
pelos motivos já registrados. D1‑4 é novo nesta varredura.

### Correção proposta (não aplicada nesta tarefa — aguardando decisão)

Conforme escopo, nenhuma correção de código foi aplicada; a alteração
teria impacto em lógica de negócio (elegibilidade de módulo por plano) e
merece decisão explícita antes de virar PR:

1. **D1‑1 (`pwa/rota.ts`) — prioridade alta.** Mesmo padrão já usado para
   `bot-detect.ts`/`minisite.ts`: materializar elegibilidade PWA
   (`estaModuloAtivo("pwa")` + `permite_pwa` do plano) em R2 —
   `tenants/{slug}/status.json` (item 1 do relatório de 14/08) já carrega
   status de liberação; adicionar `pwa_elegivel` nesse mesmo artefato
   fecharia o caso do minisite sem outra leitura. Pro domínio raiz
   (`estaModuloAtivo(env.DB, "pwa")` em `:54`/`:95`), materializar
   `config/modulos.json` (flags de rede) em R2, invalidado no toggle do
   superadmin (`alternarModulo`, já em `painel-superadmin.ts`).
2. **D1‑3 (feeds) — prioridade média.** Mesmo artefato de status já
   materializado; adicionar `modulo_grupo_olx_ativo`/`cota_*` (ou
   equivalente) resolveria `estaModuloAtivo`/`buscarCotaPortal` sem D1.
   Cota pode ter TTL curto aceitável (é limite suave, não trava de
   segurança).
3. **D1‑4 (busca-ia, busca-salva, agendamento) — prioridade menor.** Os
   três repetem o mesmo padrão `estaModuloAtivo(env.DB, "<slug>")`
   resolvível pelo artefato `config/modulos.json` da proposta 1. As
   consultas específicas de `agendamento-visita/rota.ts:131,163` (buscar
   anúncio/corretor por ID) são mais difíceis de tirar de D1 sem cache
   dedicado — mas rodam só numa ação explícita de baixo volume, não numa
   leitura de página.
4. **D1‑2 (publicacoes)** — mantém-se a decisão já registrada em 14/08 de
   não corrigir agora (múltiplas fontes de invalidação, risco de
   inconsistência maior que o ganho).

Nenhum PR foi aberto nesta tarefa — o pedido original previa isso só se
nenhuma correção fosse necessária. Como D1‑1 a D1‑4 apareceram, a
correção deve ser proposta e aprovada antes de virar código, conforme
instrução recebida.
