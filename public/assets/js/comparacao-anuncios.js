// Módulo: Comparação de Anúncios — Lote 12.8
// Permite comparar até 3 anúncios lado a lado
// Estado em memória (JS), sem localStorage
//
// ⚠️ EXCEÇÃO À REGRA DE 500 LINHAS (v1.0, seção 7)
// Este arquivo ultrapassa o alvo de ~500 linhas (563 linhas) porque é uma unidade coesa e única:
// componente de UI único e autossuficiente para comparação lado a lado de imóveis.
// Fragmentar em sub-módulos separaria a lógica de forma artificial.

(function () {
  'use strict';

  const MODULO_NOME = 'comparacao-anuncios';
  const MAX_SELECIONADOS = 3;

  // Estado em memória — anúncios selecionados para comparação
  let selecionadosParaComparacao = [];

  /**
   * Verifica se o módulo está ativo consultando o data attribute
   * Fallback para desenvolvimento: verifica query parameter ou sessionStorage
   */
  function estaModuloAtivo() {
    // Primeiro: verificar data attribute no HTML (via Worker)
    const html = document.documentElement;
    const modulosAtivos = html.getAttribute('data-modulos-ativos');
    if (modulosAtivos) {
      const modulos = modulosAtivos.split(',').map(m => m.trim());
      return modulos.includes(MODULO_NOME);
    }

    // Fallback para desenvolvimento: query parameter ?modulos=comparacao-anuncios
    const params = new URLSearchParams(window.location.search);
    const moduloParam = params.get('modulos');
    if (moduloParam) {
      const modulos = moduloParam.split(',').map(m => m.trim());
      if (modulos.includes(MODULO_NOME)) {
        return true;
      }
    }

    // Fallback: sessionStorage (testing)
    const moduloStorage = sessionStorage.getItem('modulos_ativos');
    if (moduloStorage) {
      const modulos = moduloStorage.split(',').map(m => m.trim());
      return modulos.includes(MODULO_NOME);
    }

    return false;
  }

  /**
   * Adiciona ícone de comparar ao card (junto ao favoritar)
   * Chamado durante a renderização de cada card de listagem
   */
  function adicionarIconeComparar(card, anuncio) {
    if (!estaModuloAtivo()) {
      return;
    }

    const imagemDiv = card.querySelector('.aspect-video');
    if (!imagemDiv) {
      return;
    }

    // Verifica se já foi adicionado
    if (imagemDiv.querySelector('[data-comparar-btn]')) {
      return;
    }

    const btnComparar = document.createElement('button');
    btnComparar.setAttribute('data-comparar-btn', 'true');
    btnComparar.className = 'absolute top-3 right-12 text-2xl transition';
    btnComparar.style.cursor = 'pointer';
    btnComparar.style.padding = '4px';
    btnComparar.title = 'Marcar para comparação';

    const estasSelecionado = selecionadosParaComparacao.some(a => a.id === anuncio.id);
    btnComparar.textContent = estasSelecionado ? '☑️' : '☐';

    btnComparar.addEventListener('click', (e) => {
      e.stopPropagation();
      alternarSelecao(anuncio, btnComparar);
    });

    imagemDiv.appendChild(btnComparar);
  }

  /**
   * Alterna seleção de um anúncio para comparação
   */
  function alternarSelecao(anuncio, btnElement) {
    const indice = selecionadosParaComparacao.findIndex(a => a.id === anuncio.id);

    if (indice >= 0) {
      // Remover da seleção
      selecionadosParaComparacao.splice(indice, 1);
      btnElement.textContent = '☐';
      btnElement.title = 'Marcar para comparação';
    } else {
      // Adicionar à seleção (se não atingiu o máximo)
      if (selecionadosParaComparacao.length < MAX_SELECIONADOS) {
        selecionadosParaComparacao.push(anuncio);
        btnElement.textContent = '☑️';
        btnElement.title = 'Remover da comparação';
      } else {
        alert(`Máximo de ${MAX_SELECIONADOS} anúncios para comparação.`);
        return;
      }
    }

    atualizarIndicadorSelecionados();
  }

  /**
   * Atualiza o indicador visual de "X/3 selecionados"
   */
  function atualizarIndicadorSelecionados() {
    const indicador = document.getElementById('comparacao-contador');
    if (indicador) {
      const quantidade = selecionadosParaComparacao.length;
      indicador.textContent = `${quantidade}/${MAX_SELECIONADOS}`;
      indicador.style.display = quantidade > 0 ? 'inline' : 'none';

      // Habilita botão de comparar se tiver ≥ 2 selecionados
      const btnAbrirComparacao = document.getElementById('btn-abrir-comparacao');
      if (btnAbrirComparacao) {
        btnAbrirComparacao.disabled = quantidade < 2;
        btnAbrirComparacao.style.opacity = quantidade < 2 ? '0.5' : '1';
      }
    }
  }

  /**
   * Cria o painel de comparação no DOM
   */
  function criarPainelComparacao() {
    if (selecionadosParaComparacao.length < 2) {
      alert('Selecione pelo menos 2 anúncios para comparar.');
      return;
    }

    // Remove painel antigo se existir
    const painelAntigo = document.getElementById('painel-comparacao');
    if (painelAntigo) {
      painelAntigo.remove();
    }

    const painel = document.createElement('div');
    painel.id = 'painel-comparacao';
    painel.className = 'modal-overlay comparacao';
    painel.style.zIndex = '2000';

    // Header
    const header = document.createElement('div');
    header.className = 'comparacao-header';
    header.innerHTML = `
      <h2>Comparação de Anúncios</h2>
      <button class="comparacao-fechar" aria-label="Fechar">✕</button>
    `;

    // Conteúdo da comparação
    const conteudo = document.createElement('div');
    conteudo.className = 'comparacao-conteudo';
    conteudo.innerHTML = gerarTabelaComparacao();

    // Monta o painel
    const containerInterno = document.createElement('div');
    containerInterno.className = 'comparacao-container';
    containerInterno.appendChild(header);
    containerInterno.appendChild(conteudo);

    painel.appendChild(containerInterno);

    // Injetar estilos
    if (!document.getElementById('estilos-comparacao')) {
      injetarEstilos();
    }

    document.body.appendChild(painel);

    // Event listeners
    painel.querySelector('.comparacao-fechar').addEventListener('click', () => {
      painel.remove();
    });

    painel.addEventListener('click', (e) => {
      if (e.target === painel) {
        painel.remove();
      }
    });

    // Scroll horizontal em telas pequenas
    const tabelaDiv = conteudo.querySelector('.comparacao-tabela-wrapper');
    if (tabelaDiv) {
      tabelaDiv.addEventListener('scroll', () => {
        // Feedback visual de scroll
      });
    }
  }

  /**
   * Gera o HTML da tabela de comparação
   */
  function gerarTabelaComparacao() {
    const atributos = [
      { chave: 'preco_venda', label: 'Preço (Venda)', tipo: 'preco' },
      { chave: 'preco_locacao', label: 'Preço (Locação)', tipo: 'preco' },
      { chave: 'area_util', label: 'Área Útil (m²)', tipo: 'numero' },
      { chave: 'area_total', label: 'Área Total (m²)', tipo: 'numero' },
      { chave: 'quartos', label: 'Quartos', tipo: 'numero' },
      { chave: 'banheiros', label: 'Banheiros', tipo: 'numero' },
      { chave: 'vagas', label: 'Vagas', tipo: 'numero' },
      { chave: 'condominio', label: 'Condomínio (R$)', tipo: 'preco' },
      { chave: 'iptu', label: 'IPTU (R$)', tipo: 'preco' },
      { chave: 'bairro', label: 'Bairro', tipo: 'texto' },
    ];

    let html = '<div class="comparacao-tabela-wrapper"><table class="comparacao-tabela"><thead><tr><th>Atributo</th>';

    // Cabeçalho com fotos e títulos dos anúncios
    selecionadosParaComparacao.forEach(anuncio => {
      const fotoUrl = anuncio.fotos?.[0]?.url || '/placeholder.jpg';
      const titulo = anuncio.titulo || 'Sem título';
      html += `
        <th>
          <div class="comparacao-foto">
            <img src="${fotoUrl}" alt="${titulo}" />
          </div>
          <div class="comparacao-titulo">${titulo}</div>
        </th>
      `;
    });

    html += '</tr></thead><tbody>';

    // Linhas de atributos
    atributos.forEach(attr => {
      html += `<tr><td class="comparacao-label">${attr.label}</td>`;

      selecionadosParaComparacao.forEach(anuncio => {
        const valor = anuncio[attr.chave];
        let exibicao = '—';

        if (valor !== null && valor !== undefined) {
          if (attr.tipo === 'preco') {
            exibicao = `R$ ${Number(valor).toLocaleString('pt-BR')}`;
          } else if (attr.tipo === 'numero') {
            exibicao = valor.toString();
          } else {
            exibicao = valor.toString();
          }
        }

        html += `<td class="comparacao-valor">${exibicao}</td>`;
      });

      html += '</tr>';
    });

    html += '</tbody></table></div>';

    return html;
  }

  /**
   * Injeta estilos CSS para o painel de comparação
   */
  function injetarEstilos() {
    const estilos = document.createElement('style');
    estilos.id = 'estilos-comparacao';
    estilos.textContent = `
      .modal-overlay.comparacao {
        display: flex;
        align-items: center;
        justify-content: center;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 2000;
      }

      .comparacao-container {
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        max-width: 90vw;
        max-height: 85vh;
        width: 1200px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .comparacao-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
        border-bottom: 1px solid #eee;
        flex-shrink: 0;
      }

      .comparacao-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
      }

      .comparacao-fechar {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #999;
      }

      .comparacao-fechar:hover {
        color: #333;
      }

      .comparacao-conteudo {
        flex: 1;
        overflow: auto;
        padding: 16px;
      }

      .comparacao-tabela-wrapper {
        overflow-x: auto;
        border-radius: 4px;
        border: 1px solid #eee;
      }

      .comparacao-tabela {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }

      .comparacao-tabela thead {
        background: #f5f5f5;
        position: sticky;
        top: 0;
      }

      .comparacao-tabela thead tr {
        border-bottom: 2px solid #ddd;
      }

      .comparacao-tabela th {
        padding: 12px;
        text-align: center;
        font-weight: 500;
        border-right: 1px solid #eee;
      }

      .comparacao-tabela th:first-child {
        text-align: left;
        border-right: 2px solid #ddd;
      }

      .comparacao-foto {
        margin-bottom: 8px;
      }

      .comparacao-foto img {
        width: 100%;
        max-width: 150px;
        height: 100px;
        object-fit: cover;
        border-radius: 4px;
      }

      .comparacao-titulo {
        font-weight: 600;
        font-size: 12px;
        line-height: 1.2;
        word-break: break-word;
      }

      .comparacao-label {
        font-weight: 500;
        background: #fafafa;
        border-right: 2px solid #ddd;
        padding: 12px;
        text-align: left;
      }

      .comparacao-valor {
        padding: 12px;
        text-align: center;
        border-right: 1px solid #eee;
      }

      .comparacao-tabela tbody tr {
        border-bottom: 1px solid #eee;
      }

      .comparacao-tabela tbody tr:hover {
        background: #f9f9f9;
      }

      @media (max-width: 1024px) {
        .comparacao-container {
          width: 95vw;
          max-height: 80vh;
        }

        .comparacao-foto img {
          max-width: 120px;
          height: 80px;
        }
      }

      @media (max-width: 640px) {
        .comparacao-container {
          width: 98vw;
          max-height: 75vh;
          border-radius: 0;
        }

        .comparacao-tabela {
          font-size: 12px;
        }

        .comparacao-tabela th,
        .comparacao-tabela td {
          padding: 8px;
        }

        .comparacao-foto img {
          max-width: 100px;
          height: 60px;
        }

        .comparacao-titulo {
          font-size: 11px;
        }
      }
    `;
    document.head.appendChild(estilos);
  }

  /**
   * Adiciona botão de comparação ao header da página
   */
  function adicionarBotaoComparacao() {
    if (!estaModuloAtivo()) {
      return;
    }

    const userMenu = document.getElementById('user-menu');
    if (!userMenu) {
      return;
    }

    // Verifica se já foi adicionado
    if (document.getElementById('btn-abrir-comparacao')) {
      return;
    }

    // Container para botão + contador
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '8px';

    // Contador de selecionados
    const contador = document.createElement('span');
    contador.id = 'comparacao-contador';
    contador.style.display = 'none';
    contador.style.fontSize = '12px';
    contador.style.fontWeight = '500';
    contador.style.color = '#666';

    // Botão
    const btnComparar = document.createElement('button');
    btnComparar.id = 'btn-abrir-comparacao';
    btnComparar.className = 'text-gray-600 hover:text-gray-900 font-medium text-sm';
    btnComparar.textContent = '⚖️ Comparar';
    btnComparar.disabled = true;
    btnComparar.style.opacity = '0.5';
    btnComparar.style.cursor = 'pointer';
    btnComparar.style.border = 'none';
    btnComparar.style.background = 'none';
    btnComparar.style.padding = '0';

    btnComparar.addEventListener('click', criarPainelComparacao);

    container.appendChild(btnComparar);
    container.appendChild(contador);
    userMenu.appendChild(container);
  }

  /**
   * Intercepta a criação de cards para adicionar ícone de comparação
   * Sobrescreve a função global createListingCard se ela existir
   */
  function interceptarCriacaoCards() {
    if (!estaModuloAtivo()) {
      return;
    }

    // Espera um pouco para garantir que o app.js já foi carregado
    setTimeout(() => {
      const originalCreateListingCard = window.createListingCard;

      if (typeof originalCreateListingCard === 'function') {
        window.createListingCard = function (listing) {
          const html = originalCreateListingCard.call(this, listing);
          const wrapper = document.createElement('div');
          wrapper.innerHTML = html;
          const card = wrapper.firstElementChild;
          adicionarIconeComparar(card, listing);
          return card.outerHTML;
        };
      }
    }, 100);
  }

  /**
   * Inicialização do módulo
   */
  function inicializar() {
    if (!estaModuloAtivo()) {
      return;
    }

    adicionarBotaoComparacao();
    interceptarCriacaoCards();
  }

  // Inicia quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }

  /**
   * Processa cards já renderizados e adiciona ícone de comparação
   * Chamada pelo app.js após renderizar uma página de resultados
   */
  window.processarCardsComparacao = function (listings) {
    if (!estaModuloAtivo()) {
      return;
    }

    const grid = document.getElementById('listings-grid');
    if (!grid) {
      return;
    }

    const cards = grid.querySelectorAll('[onclick*="showDetail"]');
    cards.forEach((card, indice) => {
      const listing = listings[indice];
      if (listing) {
        adicionarIconeComparar(card, listing);
      }
    });
  };

  // Exporta função para interceptar cards renderizados dinamicamente
  window.adicionarIconeComparar = adicionarIconeComparar;
})();
