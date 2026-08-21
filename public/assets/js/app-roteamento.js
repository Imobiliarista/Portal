// Roteamento e navegação: detecção de hostname, navegação entre vistas, geolocalização
// Carregue este arquivo após app.js (que define appState e CONFIG)

// ============================================================
// DETECÇÃO DE HOST
// ============================================================
function isBrokerSite() {
  const host = window.location.hostname;
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
  return !isLocalhost && !host.includes('imobiliarista.net');
}

function getBrokerSlugFromHost() {
  const host = window.location.hostname;
  const parts = host.split('.');
  return parts[0];
}

// Geolocalização/sugestão de cidade: única implementação vive em mapa.js
// (detectLocationAndSuggestCity, 10 cidades + Haversine) — esta função
// duplicava a mesma feature com menos cobertura e cálculo de distância
// menos preciso; as duas rodavam sempre, em toda página, gerando dois
// pedidos de geolocalização (e dois logs de erro) independentes por
// carregamento. Removida aqui, ver Histórico de Decisões (project.md).

// ============================================================
// NAVEGAÇÃO
// ============================================================
function loadHome() {
  document.getElementById('home-view').classList.remove('hidden');
  document.getElementById('listing-view').classList.add('hidden');
  document.getElementById('detail-view').classList.add('hidden');
  window.history.pushState({}, '', '/');
}

async function navigateToCity(citySlug) {
  await loadCity(citySlug);
}

async function loadCity(citySlug) {
  appState.currentCity = citySlug;
  appState.currentPage = 1;
  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('listing-view').classList.remove('hidden');
  document.getElementById('detail-view').classList.add('hidden');
  if (typeof resetListingMapView === 'function') resetListingMapView();

  document.getElementById('breadcrumb-city').textContent = citySlug.replace('-', ' ').toUpperCase();

  await fetchCityListings(citySlug);
  renderListings();
  window.history.pushState({}, '', `/${citySlug}`);
}

async function loadBroker(city, brokerSlug) {
  appState.currentCity = city;
  appState.currentBroker = brokerSlug;
  appState.currentPage = 1;
  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('listing-view').classList.remove('hidden');
  document.getElementById('detail-view').classList.add('hidden');
  if (typeof resetListingMapView === 'function') resetListingMapView();

  document.getElementById('breadcrumb-city').textContent = `${brokerSlug} - ${city.replace('-', ' ')}`;

  await fetchBrokerListings(brokerSlug);
  renderListings();
  window.history.pushState({}, '', `/${city}/${brokerSlug}`);
}
