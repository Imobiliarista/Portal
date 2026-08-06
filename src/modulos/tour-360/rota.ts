// Módulo de Tour Virtual 360° — Lote 12.5
// Seção 5.1.2 do project.md
// Validação simples de URL de tour virtual (Matterport, etc.)

export function validarTour360Url(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    const urlObj = new URL(url);
    // Aceita qualquer URL bem formada (http/https)
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch {
    return false;
  }
}

// Sanitiza URL para exibição segura (remove protocols perigosos)
export function sanitizarTour360Url(url: string): string | null {
  if (!validarTour360Url(url)) {
    return null;
  }

  try {
    const urlObj = new URL(url);
    return urlObj.toString();
  } catch {
    return null;
  }
}
