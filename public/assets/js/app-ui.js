// Renderização de UI: listagens, cards, detalhe do anúncio, favoritos
// Carregue este arquivo após app.js (que define appState e CONFIG)

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

  // Atualiza os pins do mapa (se estiver aberto) com o resultado já
  // filtrado/ordenado, sem fechar/reabrir o mapa a cada mudança de filtro.
  if (typeof refreshListingMapIfVisible === 'function') {
    refreshListingMapIfVisible();
  }

  if (pageListings.length === 0) {
    grid.innerHTML = '';
    noResults.classList.remove('hidden');
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  noResults.classList.add('hidden');
  grid.innerHTML = pageListings.map((listing) => createListingCard(listing)).join('');

  if (typeof processarCardsComparacao === 'function') {
    processarCardsComparacao(pageListings);
  }

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

  if (listing.vendido_removido) {
    return showUnavailableProperty(listing);
  }

  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('listing-view').classList.add('hidden');
  document.getElementById('detail-view').classList.remove('hidden');

  document.getElementById('detail-title').textContent = listing.titulo;
  document.getElementById('detail-location').textContent = `${listing.endereco}, ${listing.bairro} - ${listing.cidade}`;
  document.getElementById('detail-description').textContent = listing.descricao || 'Sem descrição disponível.';

  // Mapa de localização (Leaflet/OSM, mapa.js) — chamado direto aqui, não por
  // MutationObserver, porque este é o único ponto que sabe com certeza que os
  // dados do anúncio já estão carregados.
  const mapContainer = document.getElementById('map-container');
  if (listing.latitude && listing.longitude && typeof initDetailMap === 'function') {
    mapContainer?.classList.remove('hidden');
    initDetailMap(listing, 'map');
  } else {
    mapContainer?.classList.add('hidden');
  }
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

  document.getElementById('detail-broker-name').textContent = listing.corretor_nome || 'Corretor';
  document.getElementById('detail-broker-creci').textContent = `CRECI: ${listing.creci || 'N/A'}`;
  document.getElementById('detail-broker-phone').textContent = listing.corretor_phone || '';

  const whatsapp = listing.corretor_whatsapp || '';
  const message = `Olá! Tenho interesse no imóvel "${listing.titulo}"`;
  document.getElementById('whatsapp-btn').href = `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;

  const mainImg = document.getElementById('detail-main-image');
  mainImg.src = listing.fotos?.[0]?.url || '/placeholder.jpg';
  const thumbsDiv = document.getElementById('detail-thumbs');
  thumbsDiv.innerHTML = (listing.fotos || []).map((foto, idx) =>
    `<img src="${foto.url}" alt="Foto ${idx + 1}" class="w-20 h-20 rounded-lg object-cover cursor-pointer hover:opacity-75 transition"
      onclick="document.getElementById('detail-main-image').src='${foto.url}'" />`
  ).join('');

  if (listing.video_youtube_id) {
    renderYouTubePlayer(listing.video_youtube_id, 'detail-video-player');
  } else {
    document.getElementById('detail-video-player').innerHTML = '';
  }

  if (listing.tour_360_url) {
    renderTour360Player(listing.tour_360_url, 'detail-tour-360-player');
  } else {
    const tour360Container = document.getElementById('detail-tour-360-player');
    if (tour360Container) {
      tour360Container.innerHTML = '';
    }
  }

  const preco = listing.tipo_negocio === 'venda' ? listing.preco_venda : listing.preco_locacao;
  if (typeof renderizarCalculadora === 'function' && preco) {
    renderizarCalculadora(preco);
  }

  const isFav = appState.favorites.includes(listing.id);
  document.getElementById('favorite-btn').textContent = isFav ? '❤️ Remover dos Favoritos' : '❤️ Adicionar aos Favoritos';
  document.getElementById('favorite-btn').onclick = () => toggleFavorite(listing.id);

  const similar = appState.allListings
    .filter((l) => l.id !== listing.id && l.categoria === listing.categoria && l.tipo_negocio === listing.tipo_negocio)
    .slice(0, 3);

  document.getElementById('similar-listings').innerHTML = similar.map((s) =>
    `<div class="cursor-pointer" onclick="showDetail(${s.id})">${createListingCard(s)}</div>`
  ).join('');

  window.history.pushState({}, '', `/detail/${listing.id}`);
}

function showUnavailableProperty(listing) {
  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('listing-view').classList.add('hidden');
  document.getElementById('detail-view').classList.remove('hidden');

  const detailView = document.getElementById('detail-view');

  const similar = appState.allListings
    .filter(
      (l) =>
        l.id !== listing.id &&
        l.categoria === listing.categoria &&
        l.tipo_negocio === listing.tipo_negocio &&
        !l.vendido_removido
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
