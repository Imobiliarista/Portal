// App.js — Orquestrador fino da SPA (estado, inicialização, event listeners)
// Ordem de carregamento: app.js → app-dados.js → app-ui.js → app-roteamento.js → filtros.js
// (app-ui deve carregar antes de app-roteamento, pois app-roteamento chama renderListings())

// URLs públicas dos buckets R2 (domínio padrão *.r2.dev por enquanto — trocar
// aqui quando migrarmos para domínio customizado).
const R2_DADOS_URL = 'https://pub-1df8aa8ebdcc4a14ab44733880ba7197.r2.dev';
const R2_MIDIAS_URL = 'https://pub-bb3b2e1aa0894c65932b283e855b781b.r2.dev';

const CONFIG = {
  r2DadosUrl: R2_DADOS_URL,
  r2MidiasUrl: R2_MIDIAS_URL,
  itemsPerPage: 12,
  cityCache: {},
  brokerCache: {},
};

let appState = {
  currentCity: null,
  currentBroker: null,
  allListings: [],
  filteredListings: [],
  currentPage: 1,
  favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
  // Preenchido por fetchBrokerListings() (app-dados.js) a partir do campo
  // `modulosAtivos` de corretores/{slug}.json — módulos client-side puros
  // sem rota HTTP própria (calculadora de financiamento, comparação de
  // anúncios) checam a flag de rede aqui em vez de assumir que estão
  // sempre ativos. Ver Histórico de Decisões, project.md seção 11.
  modulosAtivos: {},
};

// ============================================================
// INICIALIZAÇÃO (movida para o final após todos os módulos carregarem)
// ============================================================
async function initializeApp() {
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
}

document.addEventListener('DOMContentLoaded', initializeApp);

window.addEventListener('popstate', () => {
  location.reload();
});

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

  document.querySelectorAll('.filter-radio, .filter-select, .filter-input').forEach((el) => {
    el.addEventListener('change', () => {
      appState.currentPage = 1;
      renderListings();
    });
  });

  document.getElementById('clear-filters')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-radio, .filter-select, .filter-input').forEach((el) => {
      if (el.type === 'radio') el.checked = false;
      else el.value = '';
    });
    appState.currentPage = 1;
    renderListings();
  });

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

function applyFilters() {
  // Preenchido por filtros.js
}
