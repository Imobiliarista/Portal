// Normalização/sanitização de strings na entrada
// Pipeline: trim() + capitalização padronizada + remoção de emojis
// Conforme seção 4.15 do project.md

// Remove emojis e caracteres especiais não suportados por parsers XML
function removerEmojisEspeciais(texto: string): string {
  return texto
    .replace(/\p{Extended_Pictographic}/gu, "") // Remove emojis
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, ""); // Remove caracteres de controle (inválidos em XML)
}

// Capitaliza a primeira letra e resto minúsculo
function capitalizarPadrao(texto: string): string {
  if (!texto) return "";
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

// Sanitiza campo de texto livre usado como filtro (Bairro/Região)
// Aplica: trim() + capitalização padronizada
export function sanitizarBairroRegiao(valor: string): string {
  if (!valor) return "";
  const trimmed = valor.trim();
  // Se contém múltiplas palavras, capitalizar cada uma
  const palavras = trimmed.split(/\s+/);
  return palavras.map((p) => capitalizarPadrao(p)).join(" ");
}

// Sanitiza campos que alimentam XML (título, descrição)
// Aplica: trim() + remoção de emojis
export function sanitizarParaXML(valor: string): string {
  if (!valor) return "";
  const trimmed = valor.trim();
  return removerEmojisEspeciais(trimmed);
}

// Sanitiza qualquer texto de entrada (genérico)
// Aplica: trim() + remoção de emojis
export function sanitizarTexto(valor: string): string {
  if (!valor) return "";
  return valor.trim().replace(/\p{Extended_Pictographic}/gu, "");
}
