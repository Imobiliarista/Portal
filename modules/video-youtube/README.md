# Módulo: video-youtube

Ver §50 (e §38-§40, §67, §90, §94) de
`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`. §50 é só o
formato do campo (`video: {provider: "youtube", id}`, "mesmo padrão" do
tour360 do §49) — este README documenta o que preenche essa ambiguidade.

## Escopo deste lote

O campo `video` do anúncio (schema, validação em
`business/listings.js#isValidVideo`, projeção pública em
`business/publishing.js`) já existe desde a Etapa 3 (§90) — é parte do
schema do anúncio, não algo opcional/removível como o módulo pwa, então
**não** foi movido para cá. Mover essa validação para
`modules/video-youtube/` violaria a direção de dependência do §39
(MODULES → BUSINESS, nunca o inverso): `business/listings.js` não pode
importar de `modules/`.

O que este módulo isola é só o conhecimento específico do provider
"youtube" — extrair um id de uma URL colada no formulário do painel e
montar a URL de embed do portal — que antes vivia duplicado e sem teste
diretamente em `frontend/painel/forms.js` e `frontend/portal/render.js`:

- `parseYoutubeId(input)` — aceita `youtube.com/watch?v=...`,
  `youtu.be/...` ou um id "nu"; usado por `frontend/painel/forms.js` ao
  montar o payload de `createListing`/`updateListing`.
- `buildEmbedUrl(id)` — monta a URL do `<iframe>` de embed; usado por
  `frontend/portal/render.js` (e, por reexportar `renderListingDetail`,
  também pelo minisite).

## Como o frontend consome este módulo

Workers Static Assets só serve o que está dentro de `frontend/`
(`wrangler.toml` `[assets] directory = "frontend"`) — então
`modules/video-youtube/index.js`, morando fora dessa pasta, nunca é
alcançável pelo browser (mesma restrição documentada em
`modules/pwa/README.md`). `scripts/generate-video-youtube-assets.js`
(mesmo padrão de `scripts/generate-pwa-assets.js`) importa
`renderFrontendModuleSource()` daqui e grava
`frontend/shared/video-youtube.generated.js` — um ESM standalone que
embute (`.toString()`, nunca redigitado) as duas funções testadas neste
módulo. `frontend/painel/forms.js` e `frontend/portal/render.js` importam
desse arquivo gerado. Regenerar com:

```
npm run generate:video-youtube
```

O arquivo gerado é commitado (nunca editado à mão) — mesmo espírito de
`business/data/cities-catalog.generated.js` e `frontend/manifest.json`.

## Decisões tomadas (§50 é enxuto — nenhuma delas está escrita no documento)

1. **Validação do campo `video` fica em `business/listings.js`, não
   aqui.** O documento não distingue "o campo no schema" de "o módulo" —
   mas §39 proíbe `business/` de depender de `modules/`, e o campo
   precisa existir mesmo que este módulo seja removido (um anúncio sem
   vídeo é só `video: null`, não um anúncio quebrado). Este módulo cobre
   só o parsing/render específico de "youtube" que o schema não precisa
   conhecer.
2. **Gerador (`scripts/generate-video-youtube-assets.js`) em vez de
   duplicação manual.** As duas funções são pequenas, mas a duplicação
   manual é exatamente o que já tinha acontecido antes deste lote
   (`parseYoutubeId` só em `forms.js`, a URL de embed só, sem teste,
   dentro do template do `<iframe>` em `render.js`) — um gerador garante
   que o código testado em Node é literalmente o que roda no browser,
   mesmo padrão já estabelecido pelo módulo pwa.
3. **Sem rota de Worker.** O parsing acontece 100% client-side no
   painel; o Worker só recebe e valida o objeto `{provider, id}` já
   pronto (§78, `business/listings.js#FIELD_RULES`) — consistente com
   "preferir client-side sempre que possível" (mesmo espírito do §44).

## Pendências

- Só o provider `"youtube"` é suportado (`business/listings.js#isValidVideo`
  também só aceita esse valor) — um segundo provider (Vimeo etc.) exigiria
  mudança de schema, fora de escopo aqui.
