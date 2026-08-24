# Módulo: tour-360

Ver §49 (e §38-§40, §50, §67, §90) de
`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`. §49 é só duas
frases — "Campo opcional na projeção pública do imóvel. Se inexistente,
componente não renderiza." — este README documenta o que preenche essa
ambiguidade.

## Por que este módulo não exporta nenhuma função

O campo `tour360` (`{url}`) já é parte do schema do anúncio desde a
Etapa 3 (`business/listings.js#isValidTour360`,
`business/publishing.js`) — não é opcional/removível como pwa, então não
pertence a este módulo (§39: MODULES → BUSINESS, nunca o inverso). Isso
é igual ao módulo video-youtube (§50).

A diferença: video-youtube (§50) tem conhecimento real
provider-específico pra isolar — extrair um id de uma URL colada, montar
uma URL de embed. Tour 360° não tem nada equivalente: **qualquer** URL
de tour (Matterport, Kuula, iStaging, etc.) já serve como está — o
portal só linka pra ela (`frontend/portal/render.js`, reaproveitado pelo
minisite), sem parsing de id nem geração de URL de embed. Não existe
lógica pura reutilizável para colocar aqui, então este módulo fica
documentação — formalizar um gerador
(`scripts/generate-tour-360-assets.js`, mesmo padrão de pwa/video-youtube)
pra embutir zero funções seria peça nova sem necessidade real (regra
fixa: "dá pra ser Static Asset/JSON/R2/Browser/módulo pequeno/Worker
privado curto? Se sim, não adicionar peça nova").

## O que este lote fechou (gaps reais, não arquitetura)

1. **Feedback client-side ausente.** `frontend/painel/forms.js` já
   manda `tourUrl` sem checagem nenhuma — diferente de `videoUrl`, que
   tem `parseYoutubeId` retornando `null` pra entrada inválida. Uma URL
   malformada só falhava depois, no Worker
   (`core/validation.js#isUrl`), sem aviso local. Resolvido sem módulo
   novo: `frontend/painel/render.js` agora usa
   `field("Tour 360 (URL)", "tour360Url", ..., "url")` —
   `<input type="url">` nativo do browser já bloqueia o submit com
   validação HTML5, mesmo padrão já usado pelos campos numéricos
   (`type="number"`) neste arquivo. (`videoUrl` continua `type="text"`
   de propósito — aceita tanto URL colada quanto um id "nu", que
   `type="url"` rejeitaria.)
2. **`.imob-tour360` sem CSS.** A classe já era usada em
   `frontend/portal/render.js` (e herdada pelo minisite via
   `renderListingDetail`) mas nunca tinha uma regra correspondente em
   `frontend/portal/styles/main.css` / `frontend/minisite/styles/main.css`
   — o link "Ver tour 360°" renderizava sem nenhum estilo. Adicionado um
   botão-pill simples, mesmo padrão visual de `.imob-load-more` (já
   existente nos dois stylesheets).

## Pendências

- Nenhuma validação de que a URL aponta pra um provider de tour 360°
  real (qualquer URL http(s) passa) — mesmo espírito de `isUrl` no
  Worker, não é escopo deste módulo restringir a uma allowlist de
  domínios.
