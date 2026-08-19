// Módulo de vídeo YouTube — Lote 12.4
// Seção 5.1.2 do project.md
// Extração segura de ID limpo (11 caracteres) de qualquer formato de URL do YouTube

export function getYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2] && match[2].length === 11 ? match[2] : null;
}
