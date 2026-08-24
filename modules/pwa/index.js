// modules/pwa/index.js
//
// Módulo pwa (§48) — ponto de entrada. Isolado: nada em core/, business/
// ou storage/ importa daqui (§39 proíbe CORE → MODULE), e o portal
// continua funcionando 100% normal se `modules/pwa/` inteiro for
// removido. O único ponto de contato com o portal é o "registro/link
// opcional" em frontend/index.html, que chama algo equivalente a
// `registerServiceWorker` abaixo — não um import direto (Workers Static
// Assets só serve `frontend/`, então o browser nunca alcança
// `modules/pwa/*.js`; ver comentário no topo de service-worker.js).
//
// Exposto:
//   - `registerServiceWorker`: helper para o frontend pedir o registro do
//     service worker gerado (frontend/service-worker.js). Testável em
//     Node via injeção de `navigator`/`document` fake.

/**
 * Registra frontend/service-worker.js e injeta o `<link rel="manifest">`
 * para frontend/manifest.json. Falha em silêncio (retorna `null`) sempre
 * que o browser não suportar service worker, ou que o registro falhar por
 * qualquer motivo (inclusive os arquivos gerados não existirem porque o
 * módulo foi removido) — nunca lança, nunca quebra quem chamou.
 *
 * `navigator`/`document` são parâmetros (não os globais) para o helper
 * ficar puro o bastante para testar em Node sem jsdom.
 */
export async function registerServiceWorker({
  navigator: nav,
  document: doc,
  serviceWorkerUrl = "/service-worker.js",
  manifestUrl = "/manifest.json",
} = {}) {
  if (!nav || !("serviceWorker" in nav)) return null;

  if (doc?.head) {
    const link = doc.createElement("link");
    link.rel = "manifest";
    link.href = manifestUrl;
    doc.head.append(link);
  }

  try {
    return await nav.serviceWorker.register(serviceWorkerUrl);
  } catch {
    return null;
  }
}
