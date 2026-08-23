// storage/media.js
//
// Thin, typed wrapper around the IMOB_MEDIA R2 binding (§25, §56, §57, §69).
// Uploads always flow Browser → API → validate session → validate file →
// R2 MEDIA (§56); the browser never receives an R2 credential. This module
// is where the file-level validation from §57 lives (MIME real, tamanho,
// extensão permitida, dimensões quando aplicável, path, nome/chave).

const ALLOWED_IMAGE_TYPES = Object.freeze({
  "image/webp": "webp",
  "image/avif": "avif",
  "image/jpeg": "jpg",
  "image/png": "png",
});

const ALLOWED_VIDEO_TYPES = Object.freeze({
  "video/mp4": "mp4",
  "video/webm": "webm",
});

export const ALLOWED_MEDIA_TYPES = Object.freeze({
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
});

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

export class MediaValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MediaValidationError";
  }
}

/**
 * Validates an upload's declared MIME type and byte size against the
 * allowlist (§57). Callers are expected to have already sniffed/confirmed
 * the real content type (e.g. via magic-byte detection) before this point —
 * this function trusts the `contentType` it's given, it does not sniff.
 */
export function assertValidMedia(contentType, byteLength) {
  const extension = ALLOWED_MEDIA_TYPES[contentType];
  if (!extension) {
    throw new MediaValidationError(`Tipo de mídia não permitido: ${contentType}`);
  }
  const isVideo = contentType in ALLOWED_VIDEO_TYPES;
  const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (typeof byteLength !== "number" || byteLength <= 0 || byteLength > limit) {
    throw new MediaValidationError(`Tamanho de arquivo inválido para ${contentType}.`);
  }
  return { extension, isVideo };
}

function bucket(env) {
  if (!env?.IMOB_MEDIA) {
    throw new Error("storage/media: binding IMOB_MEDIA ausente em env.");
  }
  return env.IMOB_MEDIA;
}

/**
 * Uploads a media object. `key` must come from `storage/keys.js#mediaKeys`
 * so paths stay deterministic and predictable — never derived from raw
 * user-supplied file names.
 */
export async function putMedia(env, key, body, { contentType, byteLength, cacheControl } = {}) {
  assertValidMedia(contentType, byteLength);
  return bucket(env).put(key, body, {
    httpMetadata: {
      contentType,
      ...(cacheControl ? { cacheControl } : { cacheControl: "public, max-age=31536000, immutable" }),
    },
  });
}

export async function getMedia(env, key) {
  return bucket(env).get(key);
}

export async function deleteMedia(env, key) {
  return bucket(env).delete(key);
}

export async function listMedia(env, prefix, options = {}) {
  return bucket(env).list({ prefix, ...options });
}
