# Módulo: financing-calculator

Ver §44 (e §38-§40, §67, §90, §94) de
`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`. §44 é curto —
"Preferir client-side sempre que possível" / "Se puro frontend, não criar
rota Worker desnecessária" — e lista a árvore de arquivos
(`index.js`, `config.js`, `README.md`), mas não especifica a fórmula de
amortização, os limites do formulário, nem onde o componente de UI entra
na página. Este README documenta o que preenche essa ambiguidade.

## Escopo deste lote

- `modules/financing-calculator/config.js` (novo): parâmetros
  configuráveis — taxa de juros anual padrão/faixa aceita, prazo
  padrão/faixa aceita (mínimo/máximo em meses) e entrada mínima (fração do
  valor do imóvel). Só referências de mercado, nenhum dado de
  corretor/imóvel/instituição financeira real.
- `modules/financing-calculator/index.js`: lógica pura, testável em Node —
  `validateFinancingInput` (valida os 4 campos contra `config.js`),
  `buildSacSchedule` (monta a tabela SAC — Sistema de Amortização
  Constante), `summarizeSchedule` (1ª/última parcela, total de juros,
  total pago) e `calculateFinancing` (ponto de entrada único: valida e,
  se válido, calcula).
- `scripts/generate-financing-calculator-assets.js` (novo, `npm run
  generate:financing-calculator`, mesmo padrão de
  `scripts/generate-comparison-assets.js`): escreve
  `frontend/shared/financing-calculator.generated.js` a partir de
  `index.js` + `config.js` — Workers Static Assets só publica `frontend/`
  (`wrangler.toml`), então o módulo não é alcançável pelo browser sem esse
  passo. Regenerar sempre que `modules/financing-calculator/index.js` ou
  `config.js` mudar.
- `frontend/portal/components/financing-calculator.js` (novo): a camada de
  DOM — formulário (valor do imóvel, entrada, taxa, prazo), resumo do
  resultado e uma tabela SAC completa colapsável ("Ver tabela completa").
- `frontend/portal/app.js` e `frontend/minisite/app.js`: chamam
  `mountFinancingCalculator(container, { propertyValue: listing.price })`
  logo após `renderListingDetail` na rota de imóvel completo (decisão 1).
- `frontend/portal/styles/main.css` e `frontend/minisite/styles/main.css`:
  estilos do formulário, resumo e tabela — os dois arquivos, ver decisão 1.

Nenhuma mudança em `worker/`, `core/`, `business/`, `storage/` ou em
qualquer schema — o cálculo roda inteiro no browser a partir de números
que o próprio visitante digita; "valor do imóvel" só é pré-preenchido a
partir do `listings/{slug}.json` já carregado pela página (nenhum dado
novo buscado, nenhuma rota nova).

## Decisões tomadas (§44 é enxuto — nenhuma delas está escrita no documento)

1. **Componente montado tanto no portal quanto no minisite, não só no
   portal.** O enunciado deste lote permite minisite "se fizer sentido no
   imóvel completo" — e faz: a página de imóvel completo
   (`../render.js#renderListingDetail`) é idêntica nos dois sites (mesmo
   preço, mesmo comprador em potencial), diferente do módulo `comparison`
   (§45), que é deliberadamente portal-only porque comparar "vários
   imóveis lado a lado" não faz sentido dentro de um minisite de um único
   corretor. `renderListingDetail` em si continua intocado — o componente
   é montado depois, via `container.append`, a partir de cada `app.js`
   (mesmo padrão "appended after the fact" do módulo `comparison`, ver
   header de `components/comparison.js`) — nunca dentro de `render.js`,
   que assim não precisa importar de volta a camada de DOM (evita import
   circular: `financing-calculator.js` importa `formatPrice` de
   `../render.js`).
2. **Taxa mensal por conversão composta, não divisão simples por 12.**
   `monthlyRate = (1 + annualRate)^(1/12) - 1` é a convenção usual de
   financiamento imobiliário no Brasil (taxa efetiva anual → equivalente
   mensal), não uma taxa nominal dividida por 12. Documentado no
   comentário de `buildSacSchedule` para quem for revisar a fórmula depois.
3. **SAC (Sistema de Amortização Constante), não Price/Tabela Price.** É o
   sistema padrão do mercado imobiliário brasileiro (amortização constante,
   parcela decrescente) — o documento não especifica qual sistema usar,
   mas SAC é a expectativa razoável para "calculadora de financiamento
   imobiliário" no contexto brasileiro. Price não foi implementado neste
   lote (ver Pendências).
4. **Entrada mínima de 20% do valor do imóvel (`minDownPaymentRatio`),
   validada mas configurável.** Referência de mercado (financiadoras
   tipicamente exigem 20%+), não uma regra de nenhuma instituição
   específica — vive em `config.js` exatamente para poder ser ajustada
   sem tocar a lógica de cálculo. `calculateFinancing` aceita um `config`
   como segundo parâmetro (default `FINANCING_CALCULATOR_CONFIG`), então
   um teste/uso futuro pode simular outra faixa sem duplicar código.
5. **Tabela completa (até 420 linhas) fica colapsada atrás de "Ver tabela
   completa (SAC)" — só o resumo (1ª/última parcela, total de juros, total
   pago) aparece por padrão.** Uma tabela de 30 anos de parcelas
   dominaria a página de imóvel completo se sempre visível; o resumo já
   responde a pergunta mais comum ("quanto eu pago por mês, quanto pago no
   total") sem exigir rolagem.
6. **Validação por campo, mensagens em `errors.<campo>`, nunca lança.**
   `validateFinancingInput`/`calculateFinancing` devolvem
   `{ valid, errors }` (mesmo formato de outros módulos deste projeto que
   tratam entrada não confiável — ver `modules/comparison`) em vez de
   lançar exceção — entrada inválida do formulário (texto num campo
   numérico, entrada negativa, prazo fora da faixa) é esperada, não um
   bug.

## Verificação

`npm test` cobre a lógica pura
(`tests/modules/financing-calculator/index.test.js`: validação campo a
campo incluindo `minDownPaymentRatio`, tabela SAC com amortização
constante/juros decrescentes/saldo zerando exatamente na última parcela,
caso-limite de 0% de juros, resumo, `calculateFinancing` end-to-end, e
que o bundle gerado se comporta identicamente ao código-fonte). A camada
de DOM (`frontend/portal/components/financing-calculator.js`, wiring em
`app.js`) segue a mesma convenção de `render.js` — verificada visualmente
via `wrangler dev`: formulário pré-preenchido com o preço do imóvel,
mensagens de erro por campo, resumo renderizado após "Calcular", tabela
completa expandindo/recolhendo, presente tanto no portal quanto num
minisite — nenhum erro de console/página em nenhum passo.

## Pendências

- **Só SAC — sem opção de Tabela Price (parcelas fixas).** Decisão 3
  acima explica a escolha; se o produto precisar comparar os dois
  sistemas, adicionar `buildPriceSchedule` em `index.js` seguindo o mesmo
  formato de linha do SAC é direto, mas não foi pedido neste lote.
- **Taxas/prazos são só referência de mercado, não integradas a nenhum
  banco/financiadora real.** Não há como o visitante saber a taxa que ele
  de fato conseguiria — a calculadora é só uma simulação educativa.
- **Nenhum registro de que um visitante simulou financiamento** (nenhuma
  analytics, nenhum lead capturado) — puramente client-side, sem Worker,
  como §44 pede; se isso virar uma necessidade real de produto (ex.
  transformar simulação em lead para o corretor), exigiria uma rota nova,
  fora do escopo deste lote.
