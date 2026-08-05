// Validação de CPF: normalização e cálculo de dígito verificador
// Algoritmo padrão brasileiro (módulo 11)

// Remove pontuação (mantém só números)
export function normalizarCPF(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

// Calcula o dígito verificador para uma sequência de 9 dígitos
function calcularDigitoVerificador(sequencia: string, multiplicadores: number[]): number {
  let soma = 0;
  for (let i = 0; i < sequencia.length; i++) {
    soma += parseInt(sequencia[i], 10) * multiplicadores[i];
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

// Valida um CPF (normalizado, apenas dígitos)
export function validarCPF(cpf: string): boolean {
  const normalizado = normalizarCPF(cpf);

  // Deve ter exatamente 11 dígitos
  if (normalizado.length !== 11) {
    return false;
  }

  // Rejeita sequências repetidas (111.111.111-11, 000.000.000-00, etc.)
  if (/^(\d)\1{10}$/.test(normalizado)) {
    return false;
  }

  // Calcula primeiro dígito verificador
  const multiplicadores1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  const digito1 = calcularDigitoVerificador(normalizado.substring(0, 9), multiplicadores1);

  if (parseInt(normalizado[9], 10) !== digito1) {
    return false;
  }

  // Calcula segundo dígito verificador
  const multiplicadores2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const digito2 = calcularDigitoVerificador(normalizado.substring(0, 10), multiplicadores2);

  if (parseInt(normalizado[10], 10) !== digito2) {
    return false;
  }

  return true;
}
