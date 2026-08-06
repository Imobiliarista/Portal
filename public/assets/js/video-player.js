// Módulo de Player YouTube — Lote 12.4
// Seção 5.1.2 do project.md
// Exibir vídeo do YouTube via youtube-nocookie.com com parâmetros oficiais

function renderYouTubePlayer(youtubeId, containerId) {
  if (!youtubeId) {
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  // Criar estrutura HTML do player conforme especificado
  const playerHTML = `
    <div class="aspect-video w-full rounded-xl overflow-hidden shadow-lg border bg-black">
      <iframe
        src="https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&playsinline=1&controls=1"
        title="Vídeo do Imóvel"
        class="w-full h-full"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        loading="lazy">
      </iframe>
    </div>
  `;

  container.innerHTML = playerHTML;
}
