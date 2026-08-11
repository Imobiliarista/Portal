// Item "Publicações" do menu principal do minisite (Lote 16, seção 4.19).
// Carregado em toda página do site (portal e minisite) — decide só se o
// link fica visível; a renderização da listagem/post em si acontece em
// publicacoes.js, carregado só dentro das páginas /publicacoes* geradas
// pelo Worker (src/modulos/publicacoes/rota.ts).
//
// Duplica localmente a detecção de minisite (mesmo padrão de isolamento
// já usado no lado do Worker, ver src/modulos/pwa/logica.ts) para não
// depender da ordem de carregamento de app-roteamento.js.

(function () {
  function ehMinisite() {
    var host = window.location.hostname;
    var localhost = host.includes('localhost') || host.includes('127.0.0.1');
    return !localhost && host !== 'imobiliarista.net' && host.endsWith('.imobiliarista.net');
  }

  function obterSlugDoHost() {
    return window.location.hostname.split('.')[0];
  }

  async function atualizarLinkPublicacoes() {
    var link = document.getElementById('link-publicacoes');
    if (!link || !ehMinisite()) return;

    try {
      var r2DadosUrl = (typeof CONFIG !== 'undefined' && CONFIG.r2DadosUrl) || '';
      var url = r2DadosUrl + '/corretores/' + obterSlugDoHost() + '.json';
      var resposta = await fetch(url);
      if (!resposta.ok) return;

      var dados = await resposta.json();
      if (dados && dados.publicacoes && dados.publicacoes.feedUrl) {
        link.classList.remove('hidden');
      }
    } catch (erro) {
      console.error('Erro ao verificar disponibilidade de Publicações:', erro);
    }
  }

  document.addEventListener('DOMContentLoaded', atualizarLinkPublicacoes);
})();
