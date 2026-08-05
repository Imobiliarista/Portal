// Filtros.js - Componente de busca avançada
// Aplica filtros ao JSON já carregado no navegador (client-side)

// Substituir a função applyFilters stub do app.js
function applyFilters() {
  const businessType = document.querySelector('input[name="business-type"]:checked')?.value || '';
  const category = document.getElementById('filter-category')?.value || '';
  const maxPrice = parseFloat(document.getElementById('filter-max-price')?.value || 0) || Infinity;
  const minBedrooms = parseFloat(document.getElementById('filter-bedrooms')?.value || 0) || 0;
  const minBathrooms = parseFloat(document.getElementById('filter-bathrooms')?.value || 0) || 0;
  const minParking = parseFloat(document.getElementById('filter-parking')?.value || 0) || 0;
  const minArea = parseFloat(document.getElementById('filter-min-area')?.value || 0) || 0;
  const region = document.getElementById('filter-region')?.value || '';

  appState.filteredListings = appState.allListings.filter((listing) => {
    // Tipo de negócio
    if (businessType && listing.tipo_negocio !== businessType) return false;

    // Categoria (Residencial, Comercial, etc.)
    if (category && listing.categoria !== category) return false;

    // Preço máximo
    const price = listing.tipo_negocio === 'venda' ? listing.preco_venda : listing.preco_locacao;
    if (price && price > maxPrice) return false;

    // Quartos
    if (minBedrooms && (!listing.quartos || listing.quartos < minBedrooms)) return false;

    // Banheiros
    if (minBathrooms && (!listing.banheiros || listing.banheiros < minBathrooms)) return false;

    // Vagas de garagem
    if (minParking && (!listing.vagas || listing.vagas < minParking)) return false;

    // Área mínima (priorizar area_util, depois area_total)
    const area = listing.area_util || listing.area_total || 0;
    if (minArea && area < minArea) return false;

    // Região/Bairro
    if (region && listing.regiao !== region) return false;

    return true;
  });
}

// Inicializar listeners de filtro quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  initializeFilters();
});

function initializeFilters() {
  // Listeners para mudanças em tempo real
  const filterElements = document.querySelectorAll('.filter-radio, .filter-select, .filter-input');

  filterElements.forEach((el) => {
    el.addEventListener('change', () => {
      appState.currentPage = 1;
      renderListings();
    });

    el.addEventListener('input', () => {
      appState.currentPage = 1;
      renderListings();
    });
  });

  // Botão de limpar filtros
  const clearBtn = document.getElementById('clear-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearAllFilters);
  }
}

function clearAllFilters() {
  // Limpar radio buttons
  document.querySelectorAll('input[name="business-type"]').forEach((el) => {
    el.checked = false;
  });

  // Limpar selects e inputs
  document.getElementById('filter-category').value = '';
  document.getElementById('filter-max-price').value = '';
  document.getElementById('filter-bedrooms').value = '';
  document.getElementById('filter-bathrooms').value = '';
  document.getElementById('filter-parking').value = '';
  document.getElementById('filter-min-area').value = '';
  document.getElementById('filter-region').value = '';

  appState.currentPage = 1;
  renderListings();
}

// Funções de atualização de filtros em tempo real
function updateFilterOptions() {
  // Atualizar opções de categoria baseado no tipo de negócio selecionado
  const businessType = document.querySelector('input[name="business-type"]:checked')?.value || '';

  // Mapeamento de categorias por tipo de negócio
  const categoryMap = {
    venda: ['Residencial', 'Comercial', 'Corporativo', 'Industrial', 'Rural'],
    locacao: ['Residencial', 'Comercial', 'Corporativo'],
    '': ['Residencial', 'Comercial', 'Corporativo', 'Industrial', 'Rural'],
  };

  const categories = categoryMap[businessType] || categoryMap[''];

  // Atualizar select de categoria (opcional: filtrar dinamicamente)
  // Por enquanto, manter todas as categorias disponíveis
}

// Aplicar filtros na busca rápida (city-search)
function filterByCityName(cityName) {
  return appState.allListings.filter((listing) => listing.cidade.toLowerCase().includes(cityName.toLowerCase()));
}

// Sugestão de autocomplete para cidades (Future enhancement)
function setupCityAutocomplete() {
  const citySearchInput = document.getElementById('city-search');
  if (!citySearchInput) return;

  const brasilianCities = ['Londrina', 'São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Brasília'];

  citySearchInput.addEventListener('input', (e) => {
    const value = e.target.value.toLowerCase();
    const suggestions = document.getElementById('city-suggestions');

    if (value.length > 2) {
      const filtered = brasilianCities.filter((city) => city.toLowerCase().includes(value));

      if (filtered.length > 0) {
        suggestions.innerHTML = filtered
          .map((city) => `<button onclick="navigateToCity('${city.toLowerCase()}')" class="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded text-white">${city}</button>`)
          .join('');
      } else {
        suggestions.innerHTML = '';
      }
    } else {
      suggestions.innerHTML = '';
    }
  });
}

// Inicializar autocomplete
document.addEventListener('DOMContentLoaded', () => {
  setupCityAutocomplete();
});
