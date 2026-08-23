// worker/index.js
//
// Entry point (§71 "Worker entry point deve ser pequeno"). With
// `run_worker_first = ["/api/*"]` in wrangler.toml (§3.2), this Worker is
// only invoked for /api/* — every public navigation is served straight
// from Static Assets / R2 and never reaches this file (§73, §89).
//
// Etapa 1 (this lot) wires the router + app shell only. Real routes
// (§72: /api/auth/login, /api/me/*, /api/admin/*, ...) land in Etapa 3/4/5/8
// as R2 PRIVATE, auth, and the painel/admin are built out. Until then every
// /api/* request answers 501 so the shape of the response contract is
// already stable for the frontend to build against.

import { Router } from "../core/router.js";
import { createApp } from "../core/app.js";
import { notImplemented } from "../core/response.js";

const router = new Router();

router.get("/api/health", async () => {
  return new Response(JSON.stringify({ ok: true, data: { status: "ok" } }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
});

router.get("/api/*", async () => notImplemented());
router.post("/api/*", async () => notImplemented());
router.put("/api/*", async () => notImplemented());
router.delete("/api/*", async () => notImplemented());

const app = createApp(router, { loggerContext: "worker" });

export default {
  fetch: app,
};
