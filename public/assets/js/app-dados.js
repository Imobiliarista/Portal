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
      return;
    }

    const index = await indexResponse.json();
    const files = index.files || [`${citySlug}.json`];

    let allListings = [];
    for (const file of files) {
      const url = `${CONFIG.r2DadosUrl}/cidades/${citySlug}/${file}`;
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
    CONFIG.brokerCache[brokerSlug] = appState.allListings;
  } catch (error) {
    console.error('Erro ao buscar anúncios do corretor:', error);
    appState.allListings = [];
  }
}
