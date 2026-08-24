# Módulo: tour-360

Ver §49 (e §38-§40, §67, §90, §94) de
`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`. §49 é uma linha
de padrão — "Campo opcional na projeção pública do imóvel. Se
inexistente, componente não renderiza." — este README documenta o que
preenche essa ambiguidade, reaproveitando o desenho já validado no
módulo video-youtube (§50, PR #12): campo opcional, sem dependência
obrigatória, componente condicional no frontend/portal.

## Escopo deste lote

O campo `tour360` do anúncio (schema, validação em
`business/listings.js#isValidTour360`, projeção pública em
`business/publishing.js`) já existe desde a Etapa 3 (§90) — é parte do
schema do anúncio, não algo opcional/removível como o módulo pwa, então
**não** foi movido para cá. Mover essa validação para
`modules/tour-360/` violaria a direção de dependência do §39
(MODULES → BUSINESS, nunca o inverso): `business/listings.js` não pode
importar de `modules/`.

Diferente do vídeo (§50 — `{provider: "youtube", id}`, onde o `id`
precisa ser extraído de uma URL colada e depois virar uma URL de
embed), o `tour360` já chega pronto como `{url}` — uma URL externa
completa apontando pro provider escolhido pelo corretor (Matterport,
Kuula, etc.). Não há id pra extrair nem embed pra montar, então este
módulo **não tem** um `parseXId`/`buildEmbedUrl` equivalente. O que ele
isola é só o "componente condicional" do §49 em si — a decisão de
quando o link deve aparecer e com que props — que antes vivia inline em
`frontend/portal/render.js`:

- `buildTour360LinkProps(tour360)` — retorna `null` se `tour360`
  estiver ausente/inválido (§49: "componente não renderiza") ou o
  objeto de props (`href`, `text`, `target`, `rel`) pra montar o link
  quando presente.

## Como o frontend consome este módulo

Workers Static Assets só serve o que está dentro de `frontend/`
(`wrangler.toml` `[assets] directory = "frontend"`) — então
`modules/tour-360/index.js`, morando fora dessa pasta, nunca é
alcançável pelo browser (mesma restrição documentada em
`modules/pwa/README.md` e `modules/video-youtube/README.md`).
`scripts/generate-tour-360-assets.js` (mesmo padrão de
`scripts/generate-video-youtube-assets.js`) importa
`renderFrontendModuleSource()` daqui e grava
`frontend/shared/tour-360.generated.js` — um ESM standalone que embute
(`.toString()`, nunca redigitado) a função testada neste módulo.
`frontend/portal/render.js` importa desse arquivo gerado (e, por
reexportar `renderListingDetail`, também o minisite). Regenerar com:

```
npm run generate:tour-360
```

O arquivo gerado é commitado (nunca editado à mão) — mesmo espírito de
`business/data/cities-catalog.generated.js` e
`frontend/shared/video-youtube.generated.js`.

## Decisões tomadas (§49 é enxuto — nenhuma delas está escrita no documento)

1. **Validação do campo `tour360` fica em `business/listings.js`, não
   aqui.** Mesmo raciocínio do módulo video-youtube: o documento não
   distingue "o campo no schema" de "o módulo", mas §39 proíbe
   `business/` de depender de `modules/`, e o campo precisa existir
   mesmo que este módulo seja removido (um anúncio sem tour é só
   `tour360: null`, não um anúncio quebrado).
2. **Sem parsing de URL/id, ao contrário do video-youtube.** O
   documento usa "mesmo padrão" pro vídeo (§50) referenciando o tour360
   (§49), mas o formato real de cada campo é diferente:
   `tour360: {url}` já é a URL final, enquanto `video: {provider, id}`
   exige resolver um id pra uma URL de embed. Duplicar um
   `parseTour360Url` que só faz `.trim()` seria abstração sem uso real
   — `frontend/painel/forms.js` continua montando o payload
   (`tour360Url.trim()`) sem depender deste módulo, e não há duplicação
   pra isolar desse lado.
3. **`target: "_blank"` / `rel: "noreferrer"` viram parte das props do
   módulo, não ficam soltos em `render.js`.** O documento não fala de
   segurança de link externo, mas o tour 360 sempre aponta pra um
   domínio de terceiro (Matterport, Kuula, etc.) — mesmo espírito da
   escolha do `youtube-nocookie.com` no módulo video-youtube: a decisão
   de "como linkar com segurança pra esse provider externo" pertence ao
   módulo, não ao template.
4. **Retorna um objeto de props, não o nó DOM.** `buildTour360LinkProps`
   é puro e testável em Node sem DOM; `el("a", ...)` continua em
   `frontend/portal/render.js`, mesmo padrão de `buildEmbedUrl` no
   módulo video-youtube (o módulo decide o *quê*, o frontend decide o
   *como montar*).

## Pendências

- Só existe validação de "é uma URL" (`business/listings.js#isUrl`) —
  não há checagem de que o domínio seja de um provider de tour 360
  conhecido (Matterport/Kuula/etc.). Como o campo aceita qualquer URL
  válida hoje, um corretor pode colar um link de qualquer natureza; uma
  lista de domínios permitidos exigiria mudança de schema/validação em
  `business/listings.js`, fora de escopo aqui.
- Sem parsing/normalização client-side no formulário do painel
  (diferente de `parseYoutubeId` no video-youtube) — decisão 2 acima
  explica o porquê; se um provider específico precisar de tratamento de
  URL no futuro (ex.: normalizar `matterport.com/show?m=` vs. link
  curto), esse dia justifica revisitar essa decisão.
