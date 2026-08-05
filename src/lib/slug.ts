// Geração de slug a partir do título do anúncio
// Padrão: minúsculo, sem acento, espaços viram hífen + ID numérico no final
// Conforme seção 4.14 do project.md

// Remove diacríticos (acentos)
function removerAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Gera slug a partir do título + ID
export function gerarSlug(titulo: string, id: number): string {
  const slugBase = removerAcentos(titulo)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Espaços viram hífen
    .replace(/[^\w-]/g, "") // Remove caracteres especiais
    .replace(/-+/g, "-") // Collapse múltiplos hífens
    .replace(/^-|-$/g, ""); // Remove hífen no início/fim

  return `${slugBase}-${id}`;
}
