// Módulo de Tour Virtual 360° — Lote 12.5
// Seção 5.1.2 do project.md
// Exibir tour 360° (Matterport, etc.) com iframe ou botão

function renderTour360Player(tourUrl, containerId) {
  if (!tourUrl) {
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  // Criar estrutura HTML para exibir tour 360°
  const playerHTML = `
    <div class="tour-360-player bg-gray-100 rounded-xl overflow-hidden shadow-lg border">
      <div class="aspect-video bg-gray-200 flex items-center justify-center">
        <button
          class="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition flex items-center gap-2"
          onclick="openTour360('${tourUrl.replace(/'/g, "\\'")}')">
          🔄 Ver Tour Virtual 360°
        </button>
      </div>
    </div>
  `;

  container.innerHTML = playerHTML;
}

function openTour360(tourUrl) {
  if (!tourUrl) return;
  window.open(tourUrl, '_blank', 'noopener,noreferrer');
}
