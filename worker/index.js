// worker/index.js
//
// Entry point (§71 "Worker entry point deve ser pequeno"). With
// `run_worker_first = ["/api/*"]` in wrangler.toml (§3.2), this Worker is
// only invoked for /api/* — every public navigation is served straight
// from Static Assets / R2 and never reaches this file (§73, §89).
//
// Etapa 4 (this lot) wires /api/auth/login and /api/auth/logout (§72,
// §26-28) — worker/auth.js is where login/sessão was always meant to land
// (see its own former placeholder comment). /api/me/* and /api/admin/*
// (worker/api.js, worker/admin.js) stay 501 until Etapa 5/8 build the
// painel/admin CRUD that needs them.

import { Router } from "../core/router.js";
import { createApp } from "../core/app.js";
import { notImplemented } from "../core/response.js";
import { handleLogin, handleLogout } from "./auth.js";

const router = new Router();

router.get("/api/health", async () => {
  return new Response(JSON.stringify({ ok: true, data: { status: "ok" } }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
});

router.post("/api/auth/login", async (request, env) => handleLogin(request, env));
router.post("/api/auth/logout", async () => handleLogout());

router.get("/api/*", async () => notImplemented());
router.post("/api/*", async () => notImplemented());
router.put("/api/*", async () => notImplemented());
router.delete("/api/*", async () => notImplemented());

const app = createApp(router, { loggerContext: "worker" });

export default {
  fetch: app,
};
