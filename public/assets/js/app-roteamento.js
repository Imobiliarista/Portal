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

// ============================================================
// GEOLOCALIZAÇÃO
// ============================================================
async function detectLocation() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      suggestNearestCity(latitude, longitude);
    },
    (error) => console.log('Geolocalização não autorizada:', error.code)
  );
}

function suggestNearestCity(lat, lng) {
  const brazilianCities = [
    { name: 'londrina', lat: -23.31, lng: -51.16 },
    { name: 'sao-paulo', lat: -23.55, lng: -46.63 },
    { name: 'rio-de-janeiro', lat: -22.9, lng: -43.18 },
    { name: 'belo-horizonte', lat: -19.92, lng: -43.94 },
  ];

  let nearest = brazilianCities[0];
  let minDist = Infinity;

  brazilianCities.forEach((city) => {
    const dist = Math.sqrt(Math.pow(city.lat - lat, 2) + Math.pow(city.lng - lng, 2));
    if (dist < minDist) {
      minDist = dist;
      nearest = city;
    }
  });

  displayCitySuggestion(nearest.name);
}

function displayCitySuggestion(cityName) {
  const suggestionsDiv = document.getElementById('city-suggestions');
  if (suggestionsDiv) {
    suggestionsDiv.innerHTML = `
      <p class="text-sm text-gray-300">Sugestão próxima a você:</p>
      <button class="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-medium"
        onclick="navigateToCity('${cityName}')">
        📍 ${cityName.replace('-', ' ').toUpperCase()}
      </button>
    `;
  }
}

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

  document.getElementById('breadcrumb-city').textContent = `${brokerSlug} - ${city.replace('-', ' ')}`;

  await fetchBrokerListings(brokerSlug);
  renderListings();
  window.history.pushState({}, '', `/${city}/${brokerSlug}`);
}
