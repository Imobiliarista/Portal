// Mapa.js - Integração com OpenStreetMap + Leaflet.js
// Renderização de mapas para listagem e detalhe do anúncio
// Suporte a Google Maps via API key opcional

const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';

let leafletLoaded = false;
let mapInstances = {};

// ============================================================
// CARREGAMENTO DE LEAFLET
// ============================================================
async function ensureLeafletLoaded() {
  if (leafletLoaded || typeof L !== 'undefined') {
    leafletLoaded = true;
    return;
  }

  return new Promise((resolve) => {
    // Carregar CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);

    // Carregar JS
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => {
      leafletLoaded = true;
      resolve();
    };
    document.head.appendChild(script);
  });
}

// ============================================================
// INICIALIZAÇÃO DE MAPA PARA LISTAGEM
// ============================================================
async function initListingMap(listings, containerId = 'map') {
  if (!listings || listings.length === 0) return;

  await ensureLeafletLoaded();

  const container = document.getElementById(containerId);
  if (!container) return;

  // Centro: primeira listagem com coordenadas
  const center = { lat: -23.31, lng: -51.16 }; // Default: Londrina
  const firstWithCoords = listings.find((l) => l.latitude && l.longitude);
  if (firstWithCoords) {
    center.lat = firstWithCoords.latitude;
    center.lng = firstWithCoords.longitude;
  }

  // Criar mapa
  const map = L.map(containerId).setView([center.lat, center.lng], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  // Adicionar markers para cada listing
  listings.forEach((listing) => {
    if (listing.latitude && listing.longitude) {
      const marker = L.marker([listing.latitude, listing.longitude]).addTo(map);
      const popupText = `
        <div class="text-sm">
          <strong>${listing.titulo}</strong><br />
          ${listing.tipo_negocio === 'venda'
            ? `R$ ${(listing.preco_venda || 0).toLocaleString('pt-BR')}`
            : `R$ ${(listing.preco_locacao || 0).toLocaleString('pt-BR')}/mês`}
        </div>
      `;
      marker.bindPopup(popupText);
    }
  });

  mapInstances[containerId] = map;
  return map;
}

// ============================================================
// INICIALIZAÇÃO DE MAPA PARA DETALHE
// ============================================================
async function initDetailMap(listing, containerId = 'map') {
  if (!listing || !listing.latitude || !listing.longitude) return;

  await ensureLeafletLoaded();

  const container = document.getElementById(containerId);
  if (!container) return;

  // Limpar mapa anterior se existir
  if (mapInstances[containerId]) {
    mapInstances[containerId].remove();
    delete mapInstances[containerId];
  }

  const map = L.map(containerId).setView([listing.latitude, listing.longitude], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  // Marker principal (vermelho)
  const marker = L.marker([listing.latitude, listing.longitude]).addTo(map);
  marker.bindPopup(`<strong>${listing.titulo}</strong><br />${listing.endereco}`);
  marker.openPopup();

  // Ícone customizado (opcional)
  const customIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  marker.setIcon(customIcon);

  mapInstances[containerId] = map;
  return map;
}

// ============================================================
// TOGGLE ENTRE MAPA E LISTAGEM
// ============================================================
function toggleMapView() {
  const grid = document.getElementById('listings-grid');
  const mapContainer = document.getElementById('map-container');
  const mapEl = document.getElementById('map');

  if (mapContainer.classList.contains('hidden')) {
    mapContainer.classList.remove('hidden');
    grid.classList.add('hidden');

    setTimeout(() => {
      initListingMap(appState.filteredListings, 'map');
    }, 100);
  } else {
    mapContainer.classList.add('hidden');
    grid.classList.remove('hidden');
  }
}

// ============================================================
// GEOLOCALIZAÇÃO E SUGESTÃO DE CIDADE
// ============================================================
function detectLocationAndSuggestCity() {
  if (!navigator.geolocation) {
    console.log('Geolocalização não suportada');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;

      // Cidades principais com coordenadas IBGE
      const brazilianCities = [
        { name: 'londrina', lat: -23.31, lng: -51.16, state: 'PR' },
        { name: 'sao-paulo', lat: -23.55, lng: -46.63, state: 'SP' },
        { name: 'rio-de-janeiro', lat: -22.9, lng: -43.18, state: 'RJ' },
        { name: 'belo-horizonte', lat: -19.92, lng: -43.94, state: 'MG' },
        { name: 'brasilia', lat: -15.77, lng: -47.88, state: 'DF' },
        { name: 'salvador', lat: -12.97, lng: -38.51, state: 'BA' },
        { name: 'fortaleza', lat: -3.73, lng: -38.53, state: 'CE' },
        { name: 'manaus', lat: -3.1, lng: -60.02, state: 'AM' },
        { name: 'recife', lat: -8.05, lng: -34.88, state: 'PE' },
        { name: 'porto-alegre', lat: -30.03, lng: -51.21, state: 'RS' },
      ];

      let nearestCity = brazilianCities[0];
      let minDistance = Infinity;

      brazilianCities.forEach((city) => {
        const distance = calculateDistance(latitude, longitude, city.lat, city.lng);
        if (distance < minDistance) {
          minDistance = distance;
          nearestCity = city;
        }
      });

      displayCitySuggestionCard(nearestCity);
    },
    (error) => {
      console.log('Erro ao obter geolocalização:', error.code);
    }
  );
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function displayCitySuggestionCard(city) {
  const suggestionsDiv = document.getElementById('city-suggestions');
  if (!suggestionsDiv) return;

  suggestionsDiv.innerHTML = `
    <div class="text-center w-full">
      <p class="text-sm text-gray-300 mb-2">📍 Você está perto de:</p>
      <button
        class="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-lg text-white font-semibold transition shadow-lg"
        onclick="navigateToCity('${city.name}')"
      >
        ${city.name.replace('-', ' ').toUpperCase()} (${city.state})
      </button>
    </div>
  `;
}

// ============================================================
// INTEGRAÇÃO COM GOOGLE MAPS (OPCIONAL/PREMIUM)
// ============================================================
const GOOGLE_MAPS_API_KEY = ''; // Deixar vazio; será preenchido pela chave do corretor (campo no Plano)

async function initGoogleMap(listing, containerId = 'map', apiKey = null) {
  if (!apiKey) {
    console.log('Google Maps API key não fornecida; usando OpenStreetMap como fallback');
    return initDetailMap(listing, containerId);
  }

  // Carregar biblioteca Google Maps
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
  script.onload = () => {
    createGoogleMapInstance(listing, containerId);
  };
  document.head.appendChild(script);
}

function createGoogleMapInstance(listing, containerId) {
  if (!window.google) return;

  const container = document.getElementById(containerId);
  if (!container) return;

  const center = { lat: listing.latitude || -23.31, lng: listing.longitude || -51.16 };

  const map = new google.maps.Map(container, {
    zoom: 15,
    center: center,
  });

  const marker = new google.maps.Marker({
    position: center,
    map: map,
    title: listing.titulo,
  });

  const infoWindow = new google.maps.InfoWindow({
    content: `<div class="text-sm"><strong>${listing.titulo}</strong><br />${listing.endereco}</div>`,
  });

  marker.addListener('click', () => {
    infoWindow.open(map, marker);
  });

  infoWindow.open(map, marker);
  mapInstances[containerId] = map;
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  detectLocationAndSuggestCity();

  // Mostrar mapa no detalhe se houver coordenadas
  const detailView = document.getElementById('detail-view');
  if (detailView) {
    const observer = new MutationObserver(() => {
      const mapContainer = document.getElementById('map-container');
      if (mapContainer && !mapContainer.classList.contains('hidden')) {
        const listing = appState.allListings.find((l) =>
          document.getElementById('detail-title')?.textContent.includes(l.titulo)
        );
        if (listing && listing.latitude && listing.longitude) {
          setTimeout(() => {
            initDetailMap(listing, 'map');
          }, 100);
        }
      }
    });
    observer.observe(detailView, { attributes: true, attributeFilter: ['class'] });
  }
});

// Resize map quando muda de visibilidade
window.addEventListener('resize', () => {
  Object.values(mapInstances).forEach((map) => {
    if (map && map.invalidateSize) {
      map.invalidateSize();
    }
  });
});
