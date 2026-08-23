// storage/public.js
//
// Thin, typed wrapper around the IMOB_DATA R2 binding (§24, §69) — city
// manifests/shards, listings, broker profiles, exports. Only the publisher
// (§31, Etapa 6) should ever call `putPublic`/`deletePublic`; read paths
// are also used by any Worker route that needs server-side access to a
// public projection (most public reads bypass the Worker entirely and hit
// R2 straight from the browser, per §73).

import { TARGET_COMPRESSED_SHARD_BYTES } from "./keys.js";

function bucket(env) {
  if (!env?.IMOB_DATA) {
    throw new Error("storage/public: binding IMOB_DATA ausente em env.");
  }
  return env.IMOB_DATA;
}

/** Reads and JSON-parses a public object. Returns `null` if it doesn't exist. */
export async function getPublic(env, key) {
  const object = await bucket(env).get(key);
  if (!object) return null;
  return object.json();
}

export async function headPublic(env, key) {
  return bucket(env).head(key);
}

/**
 * Serializes `value` as JSON and writes it to the public data bucket,
 * setting a Cache-Control appropriate for a versioned public projection
 * (§59–§61; the exact TTL policy per object type lives in storage/cache.js).
 */
export async function putPublic(env, key, value, { cacheControl, customMetadata } = {}) {
  const body = JSON.stringify(value);
  if (body.length > TARGET_COMPRESSED_SHARD_BYTES * 2) {
    // Soft guard: uncompressed size well beyond the §9 target is almost
    // always a sign a shard should have been split before writing.
    // eslint-disable-next-line no-console
    console.warn(`storage/public: objeto "${key}" está grande (${body.length} bytes não comprimidos).`);
  }
  return bucket(env).put(key, body, {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      ...(cacheControl ? { cacheControl } : {}),
    },
    customMetadata,
  });
}

export async function deletePublic(env, key) {
  return bucket(env).delete(key);
}

export async function listPublic(env, prefix, options = {}) {
  return bucket(env).list({ prefix, ...options });
}
