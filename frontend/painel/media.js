// frontend/painel/media.js
//
// Client-side pre-checks before hitting POST /api/me/media (§56-57) — a UX
// nicety only, so a broker gets immediate feedback instead of waiting on a
// round trip. storage/media.js on the Worker re-validates every upload
// regardless of what passes here; nothing here is a security boundary
// (§56 — the browser never gets an R2 credential, and never gets to skip
// server-side validation either).

const ALLOWED_TYPES = new Set(["image/webp", "image/avif", "image/jpeg", "image/png"]);
const MAX_BYTES = 15 * 1024 * 1024; // mirrors storage/media.js#MAX_IMAGE_BYTES

export class ClientMediaValidationError extends Error {}

export function assertUploadableImage(file) {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ClientMediaValidationError(`Tipo de arquivo não permitido: ${file.type || "desconhecido"}.`);
  }
  if (file.size > MAX_BYTES) {
    throw new ClientMediaValidationError("Arquivo maior que 15MB.");
  }
}
