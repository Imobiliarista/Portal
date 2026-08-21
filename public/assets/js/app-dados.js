// Busca de dados do R2: índices, listagens por cidade/corretor, cache
// Carregue este arquivo após app.js (que define appState e CONFIG)

// ============================================================
// FETCH DE DADOS (R2)
// ============================================================
async function fetchCityListings(citySlug) {
  try {
    const indexUrl = `${CONFIG.r2DadosUrl}/cidades/${citySlug}/_index.json`;
    const indexResponse = await fetch(indexUrl);

    if (!indexResponse.ok) {
      appState.allListings = [];
      appState.modulosAtivos = {};
      return;
    }

    const index = await indexResponse.json();
    appState.modulosAtivos = index.modulosAtivos || {};

    if (!index.total_anuncios) {
      appState.allListings = [];
      CONFIG.cityCache[citySlug] = [];
      return;
    }

    // Sem partição (jobs/gerar-json-cidade.ts): arquivo único e plano em
    // /cidades/{cidade}.json (nunca dentro de /cidades/{cidade}/). Com
    // partição, `particoes.arquivos` já traz o caminho completo de cada
    // arquivo (ex.: cidades/{cidade}/{bairro}.json), sem prefixo a somar.
    const arquivos = index.particoes ? index.particoes.arquivos : [`cidades/${citySlug}.json`];

    let allListings = [];
    for (const arquivo of arquivos) {
      const url = `${CONFIG.r2DadosUrl}/${arquivo}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        allListings = allListings.concat(data.listings || data);
      }
    }

    appState.allListings = allListings;
    CONFIG.cityCache[citySlug] = allListings;
  } catch (error) {
    console.error('Erro ao buscar anúncios da cidade:', error);
    appState.allListings = [];
  }
}

async function fetchBrokerListings(brokerSlug) {
  try {
    const url = `${CONFIG.r2DadosUrl}/corretores/${brokerSlug}.json`;
    const response = await fetch(url);

    if (!response.ok) {
      appState.allListings = [];
      return;
    }

    const data = await response.json();
    appState.allListings = data.listings || data;
    appState.modulosAtivos = data.modulosAtivos || {};
    CONFIG.brokerCache[brokerSlug] = appState.allListings;
  } catch (error) {
    console.error('Erro ao buscar anúncios do corretor:', error);
    appState.allListings = [];
  }
}
