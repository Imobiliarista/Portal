// frontend/shared/video-youtube.generated.js
//
// GERADO por scripts/generate-video-youtube-assets.js a partir de
// modules/video-youtube/index.js — não editar à mão (§50, módulo
// video-youtube). Regenerar com: npm run generate:video-youtube

export function parseYoutubeId(input) {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1) || null;
    if (url.hostname.includes("youtube.com")) return url.searchParams.get("v");
    return null;
  } catch {
    return /^[\w-]{6,}$/.test(trimmed) ? trimmed : null;
  }
}

export function buildEmbedUrl(id) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
}
