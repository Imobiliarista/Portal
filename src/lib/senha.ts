// Hash de senha via PBKDF2 (Web Crypto API nativa do Worker)
// Sem dependência externa, com salt único por usuário
// Conforme seção 6.2 do project.md

// Configuração PBKDF2 (balanceado entre segurança e performance)
const ITERATIONS = 100_000; // Padrão NIST 2024 mínimo
const HASH_LENGTH = 32; // 256 bits
const ALGORITHM = "PBKDF2";
const HASH_ALGORITHM = "SHA-256";

// Gera um salt aleatório (16 bytes = 128 bits)
export function gerarSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Retorna como base64 para armazenar no banco
  return btoa(String.fromCharCode(...bytes));
}

// Hash de uma senha: retorna { hash, salt } ambos em base64
export async function hashSenha(senha: string, salt?: string): Promise<{ hash: string; salt: string }> {
  // Se não fornecido, gera novo salt
  const saltUsado = salt || gerarSalt();

  // Converte salt de base64 para Uint8Array
  const saltBytes = new Uint8Array(atob(saltUsado).split("").map((c) => c.charCodeAt(0)));

  // Converte senha para Uint8Array
  const senhaEncoder = new TextEncoder();
  const senhaBytes = senhaEncoder.encode(senha);

  // Importa a chave de senha (não é uma chave criptográfica real, só input para PBKDF2)
  const chaveSenha = await crypto.subtle.importKey("raw", senhaBytes, { name: "PBKDF2" }, false, [
    "deriveBits",
  ]);

  // Deriva bits via PBKDF2
  const hashBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: HASH_ALGORITHM,
      salt: saltBytes,
      iterations: ITERATIONS,
    },
    chaveSenha,
    HASH_LENGTH * 8
  );

  // Converte para base64
  const hashBytes = new Uint8Array(hashBits);
  const hashBase64 = btoa(String.fromCharCode(...hashBytes));

  return { hash: hashBase64, salt: saltUsado };
}

// Verifica se uma senha corresponde ao hash armazenado
export async function verificarSenha(senha: string, hashArmazenado: string, saltArmazenado: string): Promise<boolean> {
  try {
    const { hash } = await hashSenha(senha, saltArmazenado);
    return hash === hashArmazenado;
  } catch {
    return false;
  }
}
