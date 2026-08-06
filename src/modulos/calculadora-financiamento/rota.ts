// Módulo de Calculadora de Financiamento — Lote 12.9
// Seção 2.1 do project.md
// Cálculo de financiamento (SAC) — 100% client-side

export interface ResultadoSAC {
  valorFinanciado: number;
  valorEntrada: number;
  parcelaInicial: number;
  totalJuros: number;
  numeroParcelas: number;
  taxaMensal: number;
}

// Valida entrada de usuário
export function validarEntrada(entrada: unknown, taxa: unknown, prazo: unknown): boolean {
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

// Calcula sistema SAC (Sistema de Amortização Constante)
// parâmetros: preco (valor do imóvel), percentualEntrada (0-100), taxaAnual (%), prazos (anos)
export function calcularSAC(
  preco: number,
  percentualEntrada: number,
  taxaAnual: number,
  prazosAnos: number
): ResultadoSAC | null {
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
  let amortizacaoMensal = valorFinanciado / numeroParcelas;
  let saldoDevedor = valorFinanciado;

  // Calcula total de juros do período
  for (let i = 1; i <= numeroParcelas; i++) {
    const jurosParcela = saldoDevedor * taxaMensal;
    totalJuros += jurosParcela;
    saldoDevedor -= amortizacaoMensal;
  }

  // Primeira parcela: amortização + juros iniciais
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

// Formata valor monetário para exibição
export function formatarMoeda(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
