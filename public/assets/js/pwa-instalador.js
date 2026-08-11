/**
 * Módulo PWA — front-end (Lote 15, seção 4.18 do project.md)
 * Suprime o mini-infobar automático do navegador (beforeinstallprompt)
 * em TODAS as páginas e guarda o evento para uso sob ação explícita do
 * visitante, nas rotas /apps/*. Também controla a visibilidade do link
 * de instalação no rodapé (só aparece quando o site tem PWA elegível).
 */
window.PwaInstalador = (function () {
  let eventoAdiado = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoAdiado = e;
  });

  window.addEventListener('appinstalled', () => {
    eventoAdiado = null;
  });

  function jaInstalado() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function temPromptDisponivel() {
    return eventoAdiado !== null;
  }

  async function instalarAgora() {
    if (!eventoAdiado) {
      return { aceito: false, motivo: 'indisponivel' };
    }

    eventoAdiado.prompt();
    const escolha = await eventoAdiado.userChoice;
    eventoAdiado = null;

    return { aceito: escolha.outcome === 'accepted' };
  }

  async function atualizarLinkRodape() {
    const link = document.getElementById('link-instalar-app');
    if (!link) return;

    try {
      const resposta = await fetch('/manifest.json', { method: 'GET', cache: 'no-cache' });
      link.classList.toggle('hidden', !resposta.ok);
    } catch (erro) {
      link.classList.add('hidden');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', atualizarLinkRodape);
  } else {
    atualizarLinkRodape();
  }

  return { jaInstalado, temPromptDisponivel, instalarAgora };
})();
