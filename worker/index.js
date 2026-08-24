// worker/index.js
//
// Entry point (§71 "Worker entry point deve ser pequeno"). With
// `run_worker_first = ["/api/*"]` in wrangler.toml (§3.2), this Worker is
// only invoked for /api/* — every public navigation is served straight
// from Static Assets / R2 and never reaches this file (§73, §89).
//
// Etapa 4 wired /api/auth/login and /api/auth/logout (§72, §26-28).
// Etapa 5 (this lot) adds /api/me/* (worker/api.js, worker/uploads.js) —
// the painel do corretor's private API (§54). /api/admin/* (worker/admin.js)
// stays 501 until Etapa 8 builds the SuperAdmin CRUD that needs it.
//
// Specific routes must be registered before the generic "/api/*" catch-alls
// below — core/router.js#match returns the first match in insertion order.

import { Router } from "../core/router.js";
import { createApp } from "../core/app.js";
import { notImplemented } from "../core/response.js";
import { handleLogin, handleLogout } from "./auth.js";
import {
  handleGetProfile,
  handlePutProfile,
  handleListListings,
  handleCreateListing,
  handleGetListing,
  handlePutListing,
  handleDeleteListing,
} from "./api.js";
import { handleUploadMedia, handleDeleteMedia } from "./uploads.js";

const router = new Router();

router.get("/api/health", async () => {
  return new Response(JSON.stringify({ ok: true, data: { status: "ok" } }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
});

router.post("/api/auth/login", async (request, env) => handleLogin(request, env));
router.post("/api/auth/logout", async () => handleLogout());

router.get("/api/me/profile", async (request, env) => handleGetProfile(request, env));
router.put("/api/me/profile", async (request, env) => handlePutProfile(request, env));

router.get("/api/me/listings", async (request, env) => handleListListings(request, env));
router.post("/api/me/listings", async (request, env) => handleCreateListing(request, env));
router.get("/api/me/listings/:id", async (request, env, ctx, params) => handleGetListing(request, env, ctx, params));
router.put("/api/me/listings/:id", async (request, env, ctx, params) => handlePutListing(request, env, ctx, params));
router.delete("/api/me/listings/:id", async (request, env, ctx, params) =>
  handleDeleteListing(request, env, ctx, params),
);

router.post("/api/me/media", async (request, env) => handleUploadMedia(request, env));
router.delete("/api/me/media/:id", async (request, env, ctx, params) => handleDeleteMedia(request, env, ctx, params));

router.get("/api/*", async () => notImplemented());
router.post("/api/*", async () => notImplemented());
router.put("/api/*", async () => notImplemented());
router.delete("/api/*", async () => notImplemented());

const app = createApp(router, { loggerContext: "worker" });

export default {
  fetch: app,
};
