# Módulo: comparison

Ver §45 (e §38-§40, §67, §90, §94) de
`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`. §45 é três frases —
"Client-side. Browser compara JSONs já carregados. Não precisa Worker." —
e não especifica onde a seleção fica guardada entre navegações, quantos
imóveis cabem lado a lado, nem quais campos entram na grade. Este README
documenta o que preenche essa ambiguidade.

## Escopo deste lote

- `modules/comparison/index.js` (novo): lógica pura, testável em Node —
  leitura/escrita da seleção (`readComparisonSlugs`/`writeComparisonSlugs`/
  `clearComparisonSlugs`, sobre `storage` injetável — `localStorage` no
  browser), `toggleComparisonSlug` (adiciona/remove respeitando
  `MAX_COMPARISON_ITEMS`) e `buildComparisonRows` (extrai os campos
  comparáveis de um array de `listings/{slug}.json` já carregados —
  `schemas/listing-public.schema.json`, §15).
- `scripts/generate-comparison-assets.js` (novo, `npm run
  generate:comparison`, mesmo padrão de
  `scripts/generate-tour-360-assets.js`): escreve
  `frontend/shared/comparison.generated.js` a partir de `index.js` —
  Workers Static Assets só publica `frontend/` (`wrangler.toml`), então o
  módulo não é alcançável pelo browser sem esse passo. Regenerar sempre que
  `modules/comparison/index.js` mudar.
- `frontend/portal/components/comparison.js` (novo): a camada de DOM —
  botão "+ Comparar" (card e imóvel completo), a barra de seleção
  persistente entre navegações, e a grade `/comparar`. Formata os valores
  brutos de `buildComparisonRows` reaproveitando
  `formatPrice`/`formatArea`/`formatPurpose` de `../render.js` (ver
  decisão 2).
- `frontend/portal/router.js`: nova rota `/comparar` (`buildComparisonUrl`,
  `parseRoute` reconhecendo `{ name: "comparison" }`) — sem parâmetros, a
  seleção em si não vai para a URL (decisão 4).
- `frontend/portal/app.js`: `renderComparisonRoute` (busca
  `dataClient.listing(slug)` para cada slug selecionado e renderiza a
  grade); a barra de seleção é montada uma vez em `mount()`, fora do
  container que o router limpa a cada navegação; os toggles de card/imóvel
  são conectados via `attachCompareToggles`/`createCompareToggleButton`
  depois que `renderCityView`/`renderListingDetail` já rodaram — nunca
  dentro deles (decisão 3).
- `frontend/portal/styles/main.css`: estilos do botão de toggle, da barra
  fixa e da tabela comparativa. Só o CSS do **portal** foi tocado —
  `frontend/minisite/styles/main.css` é um arquivo separado, intocado.

Nenhuma mudança em `worker/`, `core/`, `business/` ou em qualquer schema —
os imóveis comparados são os mesmos `listings/{slug}.json` que
`frontend/portal/data.js` já busca para a página de imóvel completo
(nenhum formato novo, nenhuma rota nova).

## Decisões tomadas (§45 é enxuto — nenhuma delas está escrita no documento)

1. **A seleção vive em `localStorage` do visitante, chave
   `imob:comparison` (array de slugs), nunca em R2/Worker.** É estado de
   quem está navegando, não do corretor/portal — persistir isso no backend
   exigiria uma rota nova, o que §45 ("não precisa Worker") descarta
   explicitamente. `readComparisonSlugs`/`writeComparisonSlugs` recebem um
   `storage` injetável (mesmo padrão de `fetchImpl` no módulo
   publications) para rodar em Node puro nos testes; no browser, o
   parâmetro é omitido e a função resolve para `localStorage` sozinha.
   Tolerante a `localStorage` indisponível (Safari privado, cota
   excedida) ou conteúdo corrompido/adulterado — nunca lança, sempre
   degrada para "seleção vazia".
2. **`buildComparisonRows` devolve valores brutos, não formatados —
   quem formata é a UI, reaproveitando `../render.js`.** O módulo (que
   também roda embutido no bundle gerado, sem `import`) poderia duplicar
   `formatPrice`/`formatArea`/`formatPurpose`, mas `frontend/portal/
   components/comparison.js` é um arquivo comum de `frontend/portal/` —
   alcança `../render.js` direto, sem precisar do `.toString()`/geração
   que módulos como tour-360 usam só porque `modules/` fica fora de
   `frontend/`. Duplicar a formatação só para poder embutir no bundle
   gerado seria abstração sem uso real (mesmo espírito da decisão 2 do
   README do tour-360).
3. **`../render.js` (compartilhado com o minisite) não foi tocado — nem
   `renderCard` nem `renderListingDetail`.** O enunciado deste lote pede o
   componente em `frontend/portal/`; o minisite reexporta essas duas
   funções (`frontend/minisite/render.js#renderCard`,
   `frontend/minisite/app.js` importa `renderListingDetail`) e não tem
   feature de comparação. Em vez de estender essas funções com um botão de
   toggle (o que vazaria pro minisite e ainda exigiria aninhar um
   `<button>` dentro do `<a class="imob-card">` que `renderCard` devolve —
   HTML inválido, interativo-dentro-de-interativo), o componente decora o
   DOM *depois* que o portal já chamou essas funções:
   `attachCompareToggles` substitui cada âncora `.imob-card` por um
   `<div class="imob-card-cell">` (âncora + botão irmãos) logo após
   `renderCityView` rodar; `renderListingRoute` faz
   `container.prepend(createCompareToggleButton(...))` logo após
   `renderListingDetail`. `renderCityView` (só usado por
   `frontend/portal/app.js`, nunca pelo minisite) também ficou intocado —
   zero mudança de assinatura em `render.js`.
4. **`MAX_COMPARISON_ITEMS = 4`, decisão de produto deste lote.** O
   documento não define quantos imóveis cabem numa comparação; 4 colunas é
   o que ainda cabe legível numa tabela lado a lado sem exigir design de
   scroll horizontal elaborado (a tabela tem `overflow-x: auto` como rede
   de segurança, mas não é o caminho principal). `toggleComparisonSlug`
   recusa adicionar além do limite (devolve `atLimit: true`, seleção
   existente intacta) em vez de descartar o mais antigo — trocar de imóvel
   é uma decisão do visitante (remover um antes de adicionar outro), não
   algo para o módulo decidir por ele.
5. **Rota `/comparar` sem parâmetros — a seleção não vai para a
   querystring/URL.** Diferente dos filtros de cidade (§20, que usam
   querystring para serem compartilháveis/copiáveis), a seleção de
   comparação é lida direto do `localStorage` a cada visita à rota; um
   link `/comparar` copiado e aberto em outro navegador simplesmente
   mostra a mensagem de "nenhum imóvel selecionado" ali, o que é o
   comportamento correto para um estado que é do dispositivo/visitante,
   não compartilhável por natureza.
6. **Um slug selecionado cujo `listings/{slug}.json` não existe mais
   (§77 — imóvel removido/despublicado) some silenciosamente da grade e é
   podado da seleção**, em vez de aparecer como uma coluna quebrada ou
   travar a página. `renderComparisonRoute` filtra os `null`s de
   `dataClient.listing(slug)` e regrava a seleção só com os slugs
   encontrados quando a contagem não bate — mesmo espírito de "se
   inexistente, componente não renderiza" (§49) aplicado a uma seleção.
7. **Limite atingido vira um `alert()` simples, não um componente de
   toast.** É um caso extremo (o visitante já tem 4 imóveis selecionados e
   tenta adicionar um 5º) numa SPA sem framework nem biblioteca de UI
   (§94) — construir infraestrutura de notificação só para esse aviso
   seria mais código do que o problema justifica.

## Verificação

`npm test` cobre a lógica pura (`tests/modules/comparison/index.test.js`:
leitura/escrita tolerante a storage ausente/corrompido, toggle
adicionar/remover/limite, extração de linhas a partir de
`listing-public.schema.json`, e que o bundle gerado se comporta
identicamente ao código-fonte) e a rota nova
(`tests/frontend/portal/router.test.js`). A camada de DOM
(`frontend/portal/components/comparison.js`, `app.js`) segue a mesma
convenção de `render.js` — verificada visualmente, não unit-testada — via
`wrangler dev` + Playwright com fixtures locais (3 imóveis, 1 cidade):
toggle a partir do card, toggle a partir do imóvel completo, barra
persistindo a seleção entre rotas, grade em `/comparar` com os 11 campos
comparados, remover uma coluna pela grade e "Limpar" pela barra — nenhum
erro de console/página em nenhum passo.

## Pendências

- **Sem persistência entre dispositivos/navegadores** — decisão 1 acima
  explica o porquê (§45 não permite Worker); um visitante que troca de
  navegador ou limpa dados do site perde a seleção. Se isso se provar uma
  necessidade real de produto, a saída seria uma URL compartilhável com os
  slugs codificados na querystring (ex. `/comparar?imoveis=a,b,c`) — não
  implementado aqui por não estar em §45 nem ter sido pedido.
- **`MAX_COMPARISON_ITEMS` não tem justificativa de UX validada com
  usuário real** — 4 é uma estimativa razoável (decisão 4), não um número
  testado.
- **Sem indicação de "quartos vencedor"/destaque de melhor valor por
  linha** (ex. destacar visualmente o menor preço entre os imóveis
  comparados) — a grade é neutra, só apresenta os valores lado a lado;
  fora de escopo de §45, que só pede "browser compara JSONs", não uma
  lógica de "qual é melhor".
