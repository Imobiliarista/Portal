/**
 * Cache Buster Module
 * Valida timestamps dos JSONs de cidade/corretor e invalida cache local se houver mudanças.
 * Conforme seção 4.6.1 do project.md.
 */

const CacheBuster = (() => {
  const STORAGE_PREFIX = 'cache_buster_';
  const INDEX_SUFFIX = '_index.json';

  /**
   * Comparar timestamp local com remoto de um arquivo-índice
   * @param {string} cacheKey - chave do cache (ex: 'londrina', 'marcos')
   * @param {string} indexUrl - URL do arquivo _index.json
   * @returns {Promise<boolean>} true se o cache foi invalidado, false caso contrário
   */
  async function checkAndInvalidate(cacheKey, indexUrl) {
    try {
      // Buscar o arquivo-índice remoto (leve, poucos KB)
      const response = await fetch(indexUrl, { cache: 'no-cache' });
      if (!response.ok) return false;

      const indexData = await response.json();
      const remoteTimestamp = indexData.last_updated;

      if (!remoteTimestamp) return false;

      // Recuperar timestamp local armazenado
      const localTimestamp = localStorage.getItem(STORAGE_PREFIX + cacheKey);

      // Se timestamps são diferentes, invalidar cache
      if (localTimestamp !== remoteTimestamp.toString()) {
        // Salvar novo timestamp
        localStorage.setItem(STORAGE_PREFIX + cacheKey, remoteTimestamp.toString());

        // Notificar Service Worker para invalidar cache
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'INVALIDATE_CACHE',
            cacheKey: cacheKey,
            timestamp: remoteTimestamp
          });
        }

        return true; // Cache foi invalidado
      }

      return false; // Cache ainda válido
    } catch (error) {
      console.warn(`[CacheBuster] Erro ao validar ${cacheKey}:`, error);
      return false;
    }
  }

  /**
   * Validar múltiplos caches (cidades/corretores)
   * @param {Array<{key: string, indexUrl: string}>} items - lista de itens a validar
   * @returns {Promise<Array>} lista de itens que foram invalidados
   */
  async function checkMultiple(items) {
    const invalidated = [];

    for (const item of items) {
      const wasInvalidated = await checkAndInvalidate(item.key, item.indexUrl);
      if (wasInvalidated) {
        invalidated.push(item.key);
      }
    }

    return invalidated;
  }

  /**
   * Detectar cidade atual e validar seu cache
   * Chamado automaticamente na inicialização da página
   */
  async function validateCurrentCity() {
    try {
      const pathname = window.location.pathname;
      const parts = pathname.split('/').filter(Boolean);

      // Tentar detectar cidade na URL (ex: /londrina, /londrina/venda/...)
      if (parts.length > 0) {
        const potentialCity = parts[0];

        // Verificar se é uma rota de cidade (não /painel, /api, etc.)
        if (!['painel', 'api', 'assets', 'icons'].includes(potentialCity)) {
          // Os JSONs de dados são servidos direto do bucket R2 público
          // (bypass do Worker nas leituras — ver app-dados.js), nunca por
          // uma rota própria em imobiliarista.net. Sem CONFIG.r2DadosUrl
          // essa URL cairia no fallback de SPA do Worker e voltaria HTML
          // em vez de JSON.
          const r2DadosUrl = (typeof CONFIG !== 'undefined' && CONFIG.r2DadosUrl) || '';
          if (!r2DadosUrl) return;
          const indexUrl = `${r2DadosUrl}/cidades/${potentialCity}/${INDEX_SUFFIX}`;
          await checkAndInvalidate(potentialCity, indexUrl);
        }
      }
    } catch (error) {
      console.warn('[CacheBuster] Erro ao validar cidade atual:', error);
    }
  }

  /**
   * Detectar corretor (minisite) e validar seu cache
   * Chamado automaticamente para minisites
   */
  async function validateCurrentBroker() {
    try {
      const pathname = window.location.pathname;
      const primeiroSegmento = pathname.split('/').filter(Boolean)[0];

      // Páginas do painel do corretor são servidas também no próprio
      // subdomínio dele (ex.: aranda.imobiliarista.net/painel/), mas não
      // são conteúdo de minisite — não há JSON de listagem pra validar
      // aqui, e o hostname sozinho não distingue os dois casos.
      if (primeiroSegmento === 'painel' || primeiroSegmento === 'painel-admin') return;

      const hostname = window.location.hostname;
      const parts = hostname.split('.');

      // Se é um subdomínio (minisite)
      if (parts.length > 2 || (parts.length === 2 && !['com', 'net', 'org', 'imobiliarista'].includes(parts[0]))) {
        const brokerSlug = parts[0];
        // Mesmo motivo do CONFIG.r2DadosUrl acima — igual app-dados.js.
        // Corretor não tem arquivo-índice próprio, só o JSON único
        // (corretores/{slug}.json); sem campo `last_updated` nele hoje,
        // esta checagem é um no-op silencioso até esse campo existir.
        const r2DadosUrl = (typeof CONFIG !== 'undefined' && CONFIG.r2DadosUrl) || '';
        if (!r2DadosUrl) return;
        const indexUrl = `${r2DadosUrl}/corretores/${brokerSlug}.json`;
        await checkAndInvalidate(brokerSlug, indexUrl);
      }
    } catch (error) {
      console.warn('[CacheBuster] Erro ao validar corretor:', error);
    }
  }

  /**
   * Registrar Service Worker se não estiver já registrado — só quando o
   * tenant atual é elegível a PWA. /sw.js 404 por design quando não é
   * (ver src/modulos/pwa/rota.ts); reaproveita a mesma checagem que
   * pwa-instalador.js já usa (GET /manifest.json só responde OK quando
   * elegível) em vez de bater direto em /sw.js e receber 404 sempre que
   * o corretor/portal não tem o módulo PWA liberado.
   */
  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
      const elegibilidade = await fetch('/manifest.json', { method: 'GET', cache: 'no-cache' });
      if (!elegibilidade.ok) return;

      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[CacheBuster] Service Worker registrado:', registration);
      return registration;
    } catch (error) {
      console.warn('[CacheBuster] Erro ao registrar Service Worker:', error);
    }
  }

  /**
   * Inicializar cache buster na carga da página
   */
  function init() {
    // Registrar Service Worker
    registerServiceWorker();

    // Aguardar DOM estar pronto
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        validateCurrentCity();
        validateCurrentBroker();
      });
    } else {
      validateCurrentCity();
      validateCurrentBroker();
    }
  }

  // Inicializar automaticamente
  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

  // Exportar interface pública
  return {
    checkAndInvalidate,
    checkMultiple,
    validateCurrentCity,
    validateCurrentBroker,
    registerServiceWorker,
    init
  };
})();
