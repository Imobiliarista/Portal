// Minimal in-memory stand-in for an R2Bucket binding, used only by tests in
// this directory so storage/*.js can be exercised without wrangler's
// Miniflare runtime. Implements just the subset of the R2Bucket API that
// storage/private.js, storage/public.js and storage/media.js call.

export class FakeR2Bucket {
  constructor() {
    this.store = new Map();
  }

  async put(key, body, options = {}) {
    this.store.set(key, { body, options });
    return { key };
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    return {
      key,
      httpMetadata: entry.options.httpMetadata,
      json: async () => JSON.parse(entry.body),
      text: async () => entry.body,
      arrayBuffer: async () => entry.body,
    };
  }

  async head(key) {
    const entry = this.store.get(key);
    return entry ? { key, httpMetadata: entry.options.httpMetadata } : null;
  }

  async delete(key) {
    this.store.delete(key);
  }

  async list({ prefix = "" } = {}) {
    const objects = [...this.store.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => ({ key }));
    return { objects, truncated: false };
  }
}
