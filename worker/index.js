// worker/index.js
//
// Entry point (§71 "Worker entry point deve ser pequeno"). With
// `run_worker_first = ["/api/*"]` in wrangler.toml (§3.2), this Worker is
// only invoked for /api/* — every public navigation is served straight
// from Static Assets / R2 and never reaches this file (§73, §89).
//
// Etapa 4 wired /api/auth/login and /api/auth/logout (§72, §26-28); the §27
// hotfix (browser-side PBKDF2) added /api/auth/salt ahead of login.
// Etapa 5 adds /api/me/* (worker/api.js, worker/uploads.js) — the painel
// do corretor's private API (§54). Etapa 8 (this lot) adds /api/admin/*
// (worker/admin.js) — approve/suspend/reactivate/publish a broker plus
// manual rebuild (§53), gated behind `requireSuperadmin`.
//
// Specific routes must be registered before the generic "/api/*" catch-alls
// below — core/router.js#match returns the first match in insertion order.

import { Router } from "../core/router.js";
import { createApp } from "../core/app.js";
import { notImplemented } from "../core/response.js";
import { handleAuthSalt, handleLogin, handleLogout } from "./auth.js";
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
import {
  handleCreateSavedSearch,
  handleConfirmSavedSearch,
  handleUnsubscribeSavedSearch,
} from "../modules/saved-search/index.js";
import { handleCreateCheckout, handleListMyCharges, handleGetMyCharge } from "./financial.js";
import { handleAsaasWebhook } from "../modules/financial/index.js";
import {
  handleListBrokers,
  handleApproveBroker,
  handleSuspendBroker,
  handleReactivateBroker,
  handlePublishBroker,
  handleRebuildCity,
  handleRebuildAll,
  handleListPlans,
  handleCreatePlan,
  handleGetPlan,
  handleUpdatePlan,
  handleDeletePlan,
  handleAssignBrokerPlan,
} from "./admin.js";
import { handleBootstrapSpecialAccounts } from "./bootstrap.js";

const router = new Router();

router.get("/api/health", async () => {
  return new Response(JSON.stringify({ ok: true, data: { status: "ok" } }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
});

router.post("/api/auth/salt", async (request, env) => handleAuthSalt(request, env));
router.post("/api/auth/login", async (request, env) => handleLogin(request, env));
router.post("/api/auth/logout", async () => handleLogout());

// Etapa 9 (§43, módulo saved-search) — únicas rotas públicas deste
// arquivo: nenhuma passa por `requireTenant`/`requireSession` (decisão de
// produto: visitante do portal, sem login, ver modules/saved-search/README.md).
router.post("/api/saved-searches", async (request, env) => handleCreateSavedSearch(request, env));
router.get("/api/saved-searches/confirm", async (request, env) => handleConfirmSavedSearch(request, env));
router.get("/api/saved-searches/unsubscribe", async (request, env) => handleUnsubscribeSavedSearch(request, env));

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

// Etapa 10 (§51, módulo financial) — checkout/consulta ficam sob
// `/api/me/*` (mesma sessão de corretor que os demais); o webhook do
// Asaas é a única rota pública deste módulo (worker/financial.js's header
// explica o porquê). Nenhuma delas chama o Asaas de verdade enquanto
// `env.FINANCIAL_ENABLED != "true"` (default deste lote) — ver
// modules/financial/README.md.
router.post("/api/me/financial/checkout", async (request, env) => handleCreateCheckout(request, env));
router.get("/api/me/financial/charges", async (request, env) => handleListMyCharges(request, env));
router.get("/api/me/financial/charges/:id", async (request, env, ctx, params) =>
  handleGetMyCharge(request, env, ctx, params),
);
router.post("/api/webhooks/asaas", async (request, env) => handleAsaasWebhook(request, env));

router.get("/api/admin/brokers", async (request, env) => handleListBrokers(request, env));
router.post("/api/admin/brokers/:id/approve", async (request, env, ctx, params) => handleApproveBroker(request, env, ctx, params));
router.post("/api/admin/brokers/:id/suspend", async (request, env, ctx, params) => handleSuspendBroker(request, env, ctx, params));
router.post("/api/admin/brokers/:id/activate", async (request, env, ctx, params) => handleReactivateBroker(request, env, ctx, params));
router.post("/api/admin/brokers/:id/publish", async (request, env, ctx, params) => handlePublishBroker(request, env, ctx, params));

router.post("/api/admin/rebuild/city/:city", async (request, env, ctx, params) => handleRebuildCity(request, env, ctx, params));
router.post("/api/admin/rebuild/all", async (request, env) => handleRebuildAll(request, env));

router.put("/api/admin/brokers/:id/plan", async (request, env, ctx, params) => handleAssignBrokerPlan(request, env, ctx, params));

// Provisionamento pontual de MASTER/TESTE (§27 hotfix pt.2, docs/OPERATIONS.md
// item 18) — guardada por SUPERADMIN_BOOTSTRAP_SECRET, não por sessão de
// superadmin (não existe ainda quando é MASTER que se está provisionando).
// Ver worker/bootstrap.js: sem o secret configurado, esta rota não existe
// de forma observável (mesmo 404 de uma rota inexistente).
router.post("/api/admin/bootstrap-special-accounts", async (request, env) =>
  handleBootstrapSpecialAccounts(request, env),
);

router.get("/api/admin/plans", async (request, env) => handleListPlans(request, env));
router.post("/api/admin/plans", async (request, env) => handleCreatePlan(request, env));
router.get("/api/admin/plans/:id", async (request, env, ctx, params) => handleGetPlan(request, env, ctx, params));
router.put("/api/admin/plans/:id", async (request, env, ctx, params) => handleUpdatePlan(request, env, ctx, params));
router.delete("/api/admin/plans/:id", async (request, env, ctx, params) => handleDeletePlan(request, env, ctx, params));

router.get("/api/*", async () => notImplemented());
router.post("/api/*", async () => notImplemented());
router.put("/api/*", async () => notImplemented());
router.delete("/api/*", async () => notImplemented());

const app = createApp(router, { loggerContext: "worker" });

export default {
  fetch: app,
};
