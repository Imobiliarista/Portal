// storage/private.js
//
// Thin, typed wrapper around the IMOB_PRIVATE R2 binding (§23, §69). This
// is the only place in the codebase allowed to call `env.IMOB_PRIVATE.*`
// directly — business/worker code always goes through here so bindings
// never get spread across the project (§69 "não espalhar env.BUCKET.get()").

function bucket(env) {
  if (!env?.IMOB_PRIVATE) {
    throw new Error("storage/private: binding IMOB_PRIVATE ausente em env.");
  }
  return env.IMOB_PRIVATE;
}

/** Reads and JSON-parses a private object. Returns `null` if it doesn't exist. */
export async function getPrivate(env, key) {
  const object = await bucket(env).get(key);
  if (!object) return null;
  return object.json();
}

/** Reads a private object's raw bytes/metadata without parsing (e.g. for ETags). */
export async function headPrivate(env, key) {
  return bucket(env).head(key);
}

/** Serializes `value` as JSON and writes it to the private bucket. */
export async function putPrivate(env, key, value, { httpMetadata, customMetadata } = {}) {
  const body = JSON.stringify(value);
  return bucket(env).put(key, body, {
    httpMetadata: { contentType: "application/json; charset=utf-8", ...httpMetadata },
    customMetadata,
  });
}

export async function deletePrivate(env, key) {
  return bucket(env).delete(key);
}

/** Lists private objects under a prefix. Use sparingly — indexes (§26) exist so callers rarely need this. */
export async function listPrivate(env, prefix, options = {}) {
  return bucket(env).list({ prefix, ...options });
}
