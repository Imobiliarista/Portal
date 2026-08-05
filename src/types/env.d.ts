declare global {
  interface Env {
    DB: D1Database;
    JSON_CACHE: R2Bucket;
  }
}

export {};
