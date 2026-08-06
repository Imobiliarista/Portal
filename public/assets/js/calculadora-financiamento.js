// Módulo: Calculadora de Financiamento — Lote 12.9
// Simulador de financiamento (SAC) — 100% client-side
// Exibe estimativa não-vinculante de parcelas

(function () {
  'use strict';

  const MODULO_NOME = 'calculadora-financiamento';
  const TAXA_PADRAO_ANUAL = 10.5; // Taxa média de mercado em %

  /**
   * Verifica se o módulo está ativo consultando o data attribute
   */
  function estaModuloAtivo() {
    const html = document.documentElement;
    const modulosAtivos = html.getAttribute('data-modulos-ativos');
    if (modulosAtivos) {
      const modulos = modulosAtivos.split(',').map((m) => m.trim());
      return modulos.includes(MODULO_NOME);
    }

    const params = new URLSearchParams(window.location.search);
    const moduloParam = params.get('modulos');
    if (moduloParam) {
      const modulos = moduloParam.split(',').map((m) => m.trim());
      if (modulos.includes(MODULO_NOME)) {
        return true;
      }
    }

    const moduloStorage = sessionStorage.getItem('modulos_ativos');
    if (moduloStorage) {
      const modulos = moduloStorage.split(',').map((m) => m.trim());
      return modulos.includes(MODULO_NOME);
    }

    return false;
  }

  /**
   * Formata número como moeda
   */
  function formatarMoeda(valor) {
    return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Valida entrada de usuário
   */
  function validarEntrada(entrada, taxa, prazo) {
    const entradaNum = Number(entrada);
    const taxaNum = Number(taxa);
    const prazoNum = Number(prazo);

    if (isNaN(entradaNum) || isNaN(taxaNum) || isNaN(prazoNum)) {
      return false;
    }

    if (entradaNum < 0 || entradaNum > 100) {
      return false;
    }

    if (taxaNum < 0 || taxaNum > 50) {
      return false;
    }

    if (prazoNum < 1 || prazoNum > 50) {
      return false;
    }

    return true;
  }

  /**
   * Calcula SAC (Sistema de Amortização Constante)
   */
  function calcularSAC(preco, percentualEntrada, taxaAnual, prazosAnos) {
    if (!validarEntrada(percentualEntrada, taxaAnual, prazosAnos)) {
      return null;
    }

    const valorEntrada = (preco * percentualEntrada) / 100;
    const valorFinanciado = preco - valorEntrada;
    const numeroParcelas = prazosAnos * 12;
    const taxaMensal = taxaAnual / 100 / 12;

    if (numeroParcelas === 0 || valorFinanciado <= 0) {
      return null;
    }

    let totalJuros = 0;
    const amortizacaoMensal = valorFinanciado / numeroParcelas;
    let saldoDevedor = valorFinanciado;

    // Calcula total de juros
    for (let i = 1; i <= numeroParcelas; i++) {
      const jurosParcela = saldoDevedor * taxaMensal;
      totalJuros += jurosParcela;
      saldoDevedor -= amortizacaoMensal;
    }

    // Primeira parcela
    const parcelaInicial = amortizacaoMensal + valorFinanciado * taxaMensal;

    return {
      valorFinanciado: Math.round(valorFinanciado * 100) / 100,
      valorEntrada: Math.round(valorEntrada * 100) / 100,
      parcelaInicial: Math.round(parcelaInicial * 100) / 100,
      totalJuros: Math.round(totalJuros * 100) / 100,
      numeroParcelas,
      taxaMensal,
    };
  }

  /**
   * Cria o widget de calculadora de financiamento
   */
  function criarCalculadora(preco, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !estaModuloAtivo()) {
      return;
    }

    // Remove calculadora anterior se existir
    const calculadoraAntiga = container.querySelector('[data-calculadora-widget]');
    if (calculadoraAntiga) {
      calculadoraAntiga.remove();
    }

    const widget = document.createElement('div');
    widget.setAttribute('data-calculadora-widget', 'true');
    widget.className = 'bg-white p-6 rounded-lg card-shadow mt-6';

    widget.innerHTML = `
      <div>
        <h3 class="font-semibold text-gray-900 mb-4">💰 Simule seu Financiamento</h3>
        <p class="text-sm text-gray-500 mb-6">
          ⚠️ Estimativa informativa — não é proposta de crédito
        </p>

        <div class="space-y-4">
          <!-- Entrada -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Entrada (%)
            </label>
            <input
              type="number"
              id="calc-entrada"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="0"
              max="100"
              step="1"
              value="20"
            />
            <p class="text-xs text-gray-500 mt-1" id="calc-entrada-valor">Entrada: R$ 0,00</p>
          </div>

          <!-- Prazo -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Prazo (anos)
            </label>
            <input
              type="number"
              id="calc-prazo"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="1"
              max="50"
              step="1"
              value="20"
            />
            <p class="text-xs text-gray-500 mt-1" id="calc-prazo-parcelas">Prazo: 240 meses</p>
          </div>

          <!-- Taxa -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Taxa Anual (%)
            </label>
            <input
              type="number"
              id="calc-taxa"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="0"
              max="50"
              step="0.1"
              value="${TAXA_PADRAO_ANUAL}"
            />
            <p class="text-xs text-gray-500 mt-1">Taxa estimada de mercado</p>
          </div>

          <!-- Resultados -->
          <div class="bg-gray-50 p-4 rounded-lg space-y-3 mt-6 border border-gray-200">
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Valor Financiado:</span>
              <span class="font-semibold text-gray-900" id="calc-resultado-financiado">R$ 0,00</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Parcela Inicial (SAC):</span>
              <span class="font-bold text-lg text-blue-600" id="calc-resultado-parcela">R$ 0,00</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Total de Juros:</span>
              <span class="font-semibold text-gray-900" id="calc-resultado-juros">R$ 0,00</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Total a Pagar:</span>
              <span class="font-semibold text-gray-900" id="calc-resultado-total">R$ 0,00</span>
            </div>
          </div>

          <p class="text-xs text-gray-500 text-center mt-4">
            Cálculo via SAC (Sistema de Amortização Constante)
          </p>
        </div>
      </div>
    `;

    container.appendChild(widget);

    // Event listeners
    const inputEntrada = widget.querySelector('#calc-entrada');
    const inputPrazo = widget.querySelector('#calc-prazo');
    const inputTaxa = widget.querySelector('#calc-taxa');

    function atualizarResultados() {
      const entrada = inputEntrada.value;
      const prazo = inputPrazo.value;
      const taxa = inputTaxa.value;

      // Atualiza labels
      const valorEntrada = (preco * Number(entrada)) / 100;
      widget.querySelector('#calc-entrada-valor').textContent = `Entrada: ${formatarMoeda(valorEntrada)}`;
      widget.querySelector('#calc-prazo-parcelas').textContent = `Prazo: ${Number(prazo) * 12} meses`;

      // Calcula
      const resultado = calcularSAC(preco, entrada, taxa, prazo);

      if (resultado) {
        widget.querySelector('#calc-resultado-financiado').textContent = formatarMoeda(
          resultado.valorFinanciado
        );
        widget.querySelector('#calc-resultado-parcela').textContent = formatarMoeda(
          resultado.parcelaInicial
        );
        widget.querySelector('#calc-resultado-juros').textContent = formatarMoeda(resultado.totalJuros);

        const total = resultado.valorFinanciado + resultado.totalJuros;
        widget.querySelector('#calc-resultado-total').textContent = formatarMoeda(total);
      }
    }

    inputEntrada.addEventListener('input', atualizarResultados);
    inputPrazo.addEventListener('input', atualizarResultados);
    inputTaxa.addEventListener('input', atualizarResultados);

    // Calcula inicial
    atualizarResultados();
  }

  /**
   * Função global chamada pelo app.js após showDetail()
   */
  window.renderizarCalculadora = function (preco) {
    if (!estaModuloAtivo()) {
      return;
    }

    // Aguarda um pouco para garantir que o DOM foi renderizado
    setTimeout(() => {
      criarCalculadora(preco, 'detail-financiamento-container');
    }, 50);
  };

  /**
   * Inicialização
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!estaModuloAtivo()) {
        return;
      }
    });
  }
})();
