// modules/feeds/registry.js
//
// Módulo feeds (§46) — "Modo Exportação": registro dos submódulos de
// exportação disponíveis. Existe desde o Lote 1 como reserva vazia; este
// lote é o primeiro a preenchê-lo, com o formato mínimo pedido: cada
// entrada expõe um id, um nome de exibição, uma função geradora pura e o
// path de saída em R2 DATA.
//
// Ponto único de extensão: um submódulo novo (ex. um formato específico
// de outro provedor) é só uma entrada nova aqui —
// modules/feeds/generator.js#regenerateFeeds itera este objeto, nunca
// conhece um id específico; frontend/painel/render.js#renderExportForm
// lê a lista pública gerada a partir daqui
// (scripts/generate-feeds-assets.js -> frontend/shared/feeds.generated.js)
// em vez de hardcodar itens. Nenhum dos dois precisa mudar quando um
// submódulo novo entrar.
//
// Cada entrada:
//   - id: chave estável — é também a chave em `broker.modules.feeds` e
//     (via `fileName`) o nome do arquivo em R2 DATA.
//   - displayName: rótulo mostrado no painel (frontend/shared/feeds.generated.js
//     só leva `{id, displayName}` de cada entrada — a função `generate`
//     nunca precisa alcançar o browser).
//   - generate(items, header): função pura, devolve o conteúdo do arquivo
//     (string) — `items` já vêm filtrados (publicado, corretor ativo,
//     submódulo habilitado) por
//     modules/feeds/generator.js#collectFeedItems.
//   - fileName: nome do arquivo em R2 DATA, sem o prefixo `feeds/`
//     (storage/keys.js#dataKeys.feed monta a chave completa,
//     `feeds/{fileName}.xml` — sempre `.xml` hoje; um submódulo futuro
//     não-XML precisaria de um pequeno ajuste ali, fora de escopo
//     enquanto só `vrsync` existir).
//   - contentType: Content-Type gravado no objeto R2
//     (storage/public.js#putPublicText).

import { generateVrsyncFeed } from "./formatters/vrsync.js";

export const FEED_SUBMODULES = Object.freeze({
  vrsync: Object.freeze({
    id: "vrsync",
    displayName: "OLX / ZAP / VivaReal (padrão VrSync)",
    generate: generateVrsyncFeed,
    fileName: "vrsync",
    contentType: "application/xml; charset=utf-8",
  }),
  // Próximo submódulo (ex. um formato específico de outro provedor) entra
  // aqui — pendência explícita deste lote, ver modules/feeds/README.md.
});

export const FEED_SUBMODULE_IDS = Object.freeze(Object.keys(FEED_SUBMODULES));
