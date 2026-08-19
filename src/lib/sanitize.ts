// Normalização/sanitização de strings na entrada
// Pipeline: trim() + capitalização padronizada + remoção de emojis
// Conforme seção 4.15 do project.md

// Remove emojis e caracteres especiais não suportados por parsers XML
function removerEmojisEspeciais(texto: string): string {
  return texto
    .replace(/\p{Extended_Pictographic}/gu, "") // Remove emojis
    // eslint-disable-next-line no-control-regex -- intencional: remove caracteres de controle (inválidos em XML)
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, "");
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

// Remove tags HTML de verdade (não escapa, retira por completo). Iterativo
// até estabilizar — uma passada só de regex não resolve tags aninhadas ou
// malformadas (ex: "<<script>script>" sobrevive a uma única substituição).
// Usado só no pipeline de exportação pra portais externos (feeds/core.ts);
// não roda no caminho de escrita do CRUD — descrição armazenada no D1 pro
// nosso próprio site não é alterada por esta função.
export function removerTagsHTML(valor: string): string {
  if (!valor) return "";
  let anterior: string;
  let atual = valor;
  do {
    anterior = atual;
    atual = atual.replace(/<[^>]*>/g, "");
  } while (atual !== anterior);
  return atual;
}

// Colapsa espaços múltiplos (inclusive os que sobram no lugar de
// <p>/<br> removidos pelo passo anterior) preservando quebra de
// parágrafo como \n\n simples.
export function normalizarEspacos(valor: string): string {
  if (!valor) return "";
  return valor
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Trunca no limite de caracteres sem cortar no meio de uma palavra —
// recua até o último espaço antes do limite.
export function truncarNoLimiteDePalavra(valor: string, limite: number): string {
  if (!valor || valor.length <= limite) return valor;
  const cortado = valor.slice(0, limite);
  const ultimoEspaco = cortado.lastIndexOf(" ");
  return (ultimoEspaco > 0 ? cortado.slice(0, ultimoEspaco) : cortado).trim();
}

// Pipeline completo pra texto que vai virar Observacao/TituloAnuncio num
// feed de portal externo (feeds/core.ts) — nesta ordem exata:
// 1) remove HTML de verdade (não só escapa)
// 2) normaliza espaço sobrando de onde havia tag de bloco
// 3) remove emoji/caracteres de controle (sanitizarParaXML já existente)
// 4) trunca no limite de palavra, só quando `limite` é passado — sempre
//    depois do strip de HTML, senão tag conta como parte do limite e
//    corta texto de verdade mais cedo do que devia
// `escaparXML` (nos formatadores) continua sendo o último passo, só no
// momento de montar a tag — nunca entra aqui.
export function sanitizarParaExportacao(valor: string, limite?: number): string {
  if (!valor) return "";
  let texto = removerTagsHTML(valor);
  texto = normalizarEspacos(texto);
  texto = sanitizarParaXML(texto);
  if (limite !== undefined) {
    texto = truncarNoLimiteDePalavra(texto, limite);
  }
  return texto;
}
