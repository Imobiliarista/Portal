// App.js - Lógica principal da SPA
// Roteamento, busca de dados do R2, renderização de listagens e detalhes

const CONFIG = {
  r2Domain: 'https://imobiliarista-jsons.cdn.imobiliarista.net', // R2 public domain
  itemsPerPage: 12,
  cityCache: {},
  brokerCache: {},
};

// Estado da aplicação
let appState = {
  currentCity: null,
  currentBroker: null,
  allListings: [],
  filteredListings: [],
  currentPage: 1,
  favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
};

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  updateFavoritesCount();
  setupEventListeners();
  await detectLocation();
  const path = window.location.pathname.split('/').filter(Boolean);

  if (path.length === 0) {
    loadHome();
  } else if (path.length === 1) {
    await loadCity(path[0]);
  } else if (path.length >= 2) {
    const city = path[0];
    const brokerSlug = path[1];
    await loadBroker(city, brokerSlug);
  }
});

window.addEventListener('popstate', () => {
  location.reload();
});

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
  // Exemplo: cidades brasileiras principais com lat/lng IBGE
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

// ============================================================
// FETCH DE DADOS (R2)
// ============================================================
async function fetchCityListings(citySlug) {
  try {
    // Busca o índice de cidade primeiro (_index.json)
    const indexUrl = `${CONFIG.r2Domain}/cidades/${citySlug}/_index.json`;
    const indexResponse = await fetch(indexUrl);

    if (!indexResponse.ok) {
      appState.allListings = [];
      return;
    }

    const index = await indexResponse.json();
    const files = index.files || [`${citySlug}.json`];

    // Busca todos os arquivos de partição se existirem
    let allListings = [];
    for (const file of files) {
      const url = `${CONFIG.r2Domain}/cidades/${citySlug}/${file}`;
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
    const url = `${CONFIG.r2Domain}/corretores/${brokerSlug}.json`;
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

// ============================================================
// RENDERIZAÇÃO
// ============================================================
function renderListings() {
  const grid = document.getElementById('listings-grid');
  const noResults = document.getElementById('no-results');
  const countEl = document.getElementById('listing-count');

  appState.filteredListings = [...appState.allListings];
  applyFilters();

  const start = (appState.currentPage - 1) * CONFIG.itemsPerPage;
  const end = start + CONFIG.itemsPerPage;
  const pageListings = appState.filteredListings.slice(start, end);

  countEl.textContent = `${appState.filteredListings.length} imóvel(is) encontrado(s)`;

  if (pageListings.length === 0) {
    grid.innerHTML = '';
    noResults.classList.remove('hidden');
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  noResults.classList.add('hidden');
  grid.innerHTML = pageListings.map((listing) => createListingCard(listing)).join('');
  renderPagination();
}

function createListingCard(listing) {
  const isFav = appState.favorites.includes(listing.id);
  const badge = listing.tipo_negocio === 'venda'
    ? '<span class="absolute top-3 right-3 px-3 py-1 bg-red-600 text-white text-xs font-bold rounded">VENDA</span>'
    : '<span class="absolute top-3 right-3 px-3 py-1 bg-cyan-500 text-white text-xs font-bold rounded">ALUGUEL</span>';

  return `
    <div class="bg-white rounded-lg card-shadow overflow-hidden hover:shadow-lg transition cursor-pointer"
      onclick="showDetail(${listing.id})">
      <div class="relative aspect-video bg-gray-300 overflow-hidden">
        <img src="${listing.fotos?.[0]?.url || '/placeholder.jpg'}"
          alt="${listing.titulo}"
          class="w-full h-full object-cover hover:scale-105 transition" />
        ${badge}
        <button class="absolute top-3 left-3 text-2xl"
          onclick="event.stopPropagation(); toggleFavorite(${listing.id})">
          ${isFav ? '❤️' : '🤍'}
        </button>
      </div>
      <div class="p-4">
        <h3 class="font-bold text-lg text-gray-900 mb-2 line-clamp-2">${listing.titulo}</h3>
        <p class="text-2xl font-bold text-slate-900 mb-2">
          ${listing.tipo_negocio === 'venda'
            ? `R$ ${(listing.preco_venda || 0).toLocaleString('pt-BR')}`
            : `R$ ${(listing.preco_locacao || 0).toLocaleString('pt-BR')}/mês`}
        </p>
        <p class="text-sm text-gray-600 mb-3">${listing.bairro}, ${listing.cidade}</p>
        <div class="flex gap-4 text-sm text-gray-700">
          <span>🛏️ ${listing.quartos || 0}</span>
          <span>🚿 ${listing.banheiros || 0}</span>
          <span>🚗 ${listing.vagas || 0}</span>
          <span>📐 ${listing.area_util || listing.area_total || 0}m²</span>
        </div>
      </div>
    </div>
  `;
}

function renderPagination() {
  const totalPages = Math.ceil(appState.filteredListings.length / CONFIG.itemsPerPage);
  const paginationDiv = document.getElementById('pagination');

  if (totalPages <= 1) {
    paginationDiv.innerHTML = '';
    return;
  }

  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    const active = i === appState.currentPage ? 'bg-slate-900 text-white' : 'bg-gray-200 hover:bg-gray-300';
    html += `<button class="px-3 py-2 rounded-lg ${active} transition" onclick="goToPage(${i})">${i}</button>`;
  }
  paginationDiv.innerHTML = html;
}

function goToPage(page) {
  appState.currentPage = page;
  renderListings();
  document.getElementById('listings-grid').scrollIntoView({ behavior: 'smooth' });
}

// ============================================================
// DETALHE DO ANÚNCIO
// ============================================================
function showDetail(listingId) {
  const listing = appState.allListings.find((l) => l.id === listingId);
  if (!listing) return;

  // Lote 11: Verificar se anúncio está marcado como vendido/removido
  if (listing.vendido_removido) {
    return showUnavailableProperty(listing);
  }

  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('listing-view').classList.add('hidden');
  document.getElementById('detail-view').classList.remove('hidden');

  // Preencher dados
  document.getElementById('detail-title').textContent = listing.titulo;
  document.getElementById('detail-location').textContent = `${listing.endereco}, ${listing.bairro} - ${listing.cidade}`;
  document.getElementById('detail-description').textContent = listing.descricao || 'Sem descrição disponível.';
  document.getElementById('detail-price').textContent =
    listing.tipo_negocio === 'venda'
      ? `R$ ${(listing.preco_venda || 0).toLocaleString('pt-BR')}`
      : `R$ ${(listing.preco_locacao || 0).toLocaleString('pt-BR')}/mês`;

  const badge = document.getElementById('detail-badge');
  if (listing.tipo_negocio === 'venda') {
    badge.textContent = 'VENDA';
    badge.className = 'px-4 py-2 rounded-lg text-white text-center font-semibold badge-venda';
  } else {
    badge.textContent = 'LOCAÇÃO';
    badge.className = 'px-4 py-2 rounded-lg text-white text-center font-semibold badge-locacao';
  }

  document.getElementById('detail-bedrooms').textContent = listing.quartos || '-';
  document.getElementById('detail-bathrooms').textContent = listing.banheiros || '-';
  document.getElementById('detail-parking').textContent = listing.vagas || '-';
  document.getElementById('detail-area').textContent = listing.area_util || listing.area_total || '-';

  // Broker info
  document.getElementById('detail-broker-name').textContent = listing.corretor_nome || 'Corretor';
  document.getElementById('detail-broker-creci').textContent = `CRECI: ${listing.creci || 'N/A'}`;
  document.getElementById('detail-broker-phone').textContent = listing.corretor_phone || '';

  // WhatsApp
  const whatsapp = listing.corretor_whatsapp || '';
  const message = `Olá! Tenho interesse no imóvel "${listing.titulo}"`;
  document.getElementById('whatsapp-btn').href = `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;

  // Galeria
  const mainImg = document.getElementById('detail-main-image');
  mainImg.src = listing.fotos?.[0]?.url || '/placeholder.jpg';
  const thumbsDiv = document.getElementById('detail-thumbs');
  thumbsDiv.innerHTML = (listing.fotos || []).map((foto, idx) =>
    `<img src="${foto.url}" alt="Foto ${idx + 1}" class="w-20 h-20 rounded-lg object-cover cursor-pointer hover:opacity-75 transition"
      onclick="document.getElementById('detail-main-image').src='${foto.url}'" />`
  ).join('');

  // Favorito
  const isFav = appState.favorites.includes(listing.id);
  document.getElementById('favorite-btn').textContent = isFav ? '❤️ Remover dos Favoritos' : '❤️ Adicionar aos Favoritos';
  document.getElementById('favorite-btn').onclick = () => toggleFavorite(listing.id);

  // Semelhantes
  const similar = appState.allListings
    .filter((l) => l.id !== listing.id && l.categoria === listing.categoria && l.tipo_negocio === listing.tipo_negocio)
    .slice(0, 3);

  document.getElementById('similar-listings').innerHTML = similar.map((s) =>
    `<div class="cursor-pointer" onclick="showDetail(${s.id})">${createListingCard(s)}</div>`
  ).join('');

  window.history.pushState({}, '', `/detail/${listing.id}`);
}

// Lote 11: Mostrar página de imóvel não disponível (vendido/removido)
function showUnavailableProperty(listing) {
  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('listing-view').classList.add('hidden');
  document.getElementById('detail-view').classList.remove('hidden');

  // Limpar detalhe anterior e mostrar mensagem de indisponibilidade
  const detailView = document.getElementById('detail-view');

  // Encontrar anúncios semelhantes (mesma cidade/categoria, excluindo vendidos/removidos)
  const similar = appState.allListings
    .filter(
      (l) =>
        l.id !== listing.id &&
        l.categoria === listing.categoria &&
        l.tipo_negocio === listing.tipo_negocio &&
        !l.vendido_removido // Apenas anúncios ativos
    )
    .slice(0, 3);

  const similarHTML = similar.length > 0
    ? `<div id="similar-listings" class="grid grid-cols-1 md:grid-cols-3 gap-6">
        ${similar.map((s) => `<div class="cursor-pointer" onclick="showDetail(${s.id})">${createListingCard(s)}</div>`).join('')}
       </div>`
    : '<p class="text-gray-600 text-center py-8">Nenhum anúncio semelhante disponível no momento.</p>';

  detailView.innerHTML = `
    <div class="max-w-6xl mx-auto px-4 py-8">
      <button id="back-btn" class="mb-4 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition">
        ← Voltar
      </button>

      <div class="bg-yellow-50 border-l-4 border-yellow-400 p-6 mb-8">
        <h1 class="text-3xl font-bold text-yellow-800 mb-2">Este imóvel não está mais disponível</h1>
        <p class="text-yellow-700">
          O anúncio "<strong>${listing.titulo}</strong>" foi removido ou já foi vendido.
        </p>
      </div>

      <div class="mb-8">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Imóveis semelhantes que podem interessar</h2>
        ${similarHTML}
      </div>
    </div>
  `;

  // Re-adicionar event listener do botão voltar
  document.getElementById('back-btn').addEventListener('click', showBackFromDetail);

  window.history.pushState({}, '', `/detail/${listing.id}`);
}

function showBackFromDetail() {
  if (appState.currentBroker) {
    loadBroker(appState.currentCity, appState.currentBroker);
  } else {
    loadCity(appState.currentCity);
  }
}

// ============================================================
// FAVORITOS
// ============================================================
function toggleFavorite(listingId) {
  const idx = appState.favorites.indexOf(listingId);
  if (idx > -1) {
    appState.favorites.splice(idx, 1);
  } else {
    appState.favorites.push(listingId);
  }
  localStorage.setItem('favorites', JSON.stringify(appState.favorites));
  updateFavoritesCount();

  // Re-renderizar se em listagem
  if (!document.getElementById('detail-view').classList.contains('hidden')) {
    showDetail(appState.allListings.find((l) => l.id === listingId)?.id || listingId);
  } else if (!document.getElementById('listing-view').classList.contains('hidden')) {
    renderListings();
  }
}

function updateFavoritesCount() {
  const count = document.getElementById('favorites-count');
  if (count) count.textContent = appState.favorites.length;
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  const searchBtn = document.getElementById('search-btn');
  const citySearch = document.getElementById('city-search');
  const backBtn = document.getElementById('back-btn');
  const toggleFiltersBtn = document.getElementById('toggle-filters');

  if (searchBtn) searchBtn.addEventListener('click', () => {
    const city = citySearch.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (city) navigateToCity(city);
  });

  if (citySearch) citySearch.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchBtn.click();
  });

  if (backBtn) backBtn.addEventListener('click', showBackFromDetail);

  if (toggleFiltersBtn) toggleFiltersBtn.addEventListener('click', () => {
    const panel = document.getElementById('filters-panel');
    panel.classList.toggle('hidden');
  });

  // Atualizar listagem ao mudar filtros
  document.querySelectorAll('.filter-radio, .filter-select, .filter-input').forEach((el) => {
    el.addEventListener('change', () => {
      appState.currentPage = 1;
      renderListings();
    });
  });

  // Botão limpar filtros
  document.getElementById('clear-filters')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-radio, .filter-select, .filter-input').forEach((el) => {
      if (el.type === 'radio') el.checked = false;
      else el.value = '';
    });
    appState.currentPage = 1;
    renderListings();
  });

  // Ordenação
  document.getElementById('sort-by')?.addEventListener('change', (e) => {
    sortListings(e.target.value);
  });
}

function sortListings(sortBy) {
  switch (sortBy) {
    case 'price-low':
      appState.filteredListings.sort((a, b) => (a.preco_venda || a.preco_locacao || 0) - (b.preco_venda || b.preco_locacao || 0));
      break;
    case 'price-high':
      appState.filteredListings.sort((a, b) => (b.preco_venda || b.preco_locacao || 0) - (a.preco_venda || a.preco_locacao || 0));
      break;
    case 'recent':
    default:
      appState.filteredListings.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  }
  appState.currentPage = 1;
  renderListings();
}

// Stub para filtros (implementado em filtros.js)
function applyFilters() {
  // Preenchido por filtros.js
}
