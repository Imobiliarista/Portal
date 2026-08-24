// frontend/admin/app.js
//
// Wires login + the SuperAdmin dashboard together (§53, Etapa 8). Same
// "a failed private call bounces to login" convention as
// frontend/painel/app.js — here there is no single GET /api/admin/me to
// probe on mount (out of scope for this lot), so the dashboard's own first
// load (GET /api/admin/brokers, via frontend/admin/brokers.js) doubles as
// that probe: a 401 from it bounces to the login screen exactly like an
// expired session would mid-use.
//
// Client-side role check (login response's `role !== "superadmin"`) is
// pure UX — a broker who somehow reaches this host gets bounced back to
// the login screen with a clear message instead of a dashboard that would
// 403 on every request. Real enforcement is server-side
// (worker/admin.js#requireAdmin -> core/permissions.js#requireSuperadmin)
// regardless of what this file does.

import * as api from "./data.js";
import { isSessionExpired } from "./data.js";
import { renderLoading, renderLogin, renderAppShell } from "./render.js";
import { createBrokersSection } from "./brokers.js";
import { createRebuildSection } from "./publishing.js";

function injectStylesheet() {
  if (document.querySelector("link[data-imob-admin-styles]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/admin/styles/main.css"; // absolute — same reasoning as frontend/painel/app.js
  link.dataset.imobAdminStyles = "true";
  document.head.append(link);
}

export function mount(container) {
  injectStylesheet();

  function showLogin(error) {
    renderLogin(container, { error }, { onLogin: handleLogin });
  }

  async function handleLogin(email, password) {
    renderLogin(container, { submitting: true }, { onLogin: handleLogin });
    try {
      const result = await api.login(email, password);
      if (result.role !== "superadmin") {
        await api.logout().catch(() => {});
        return showLogin("Acesso restrito a SuperAdmin.");
      }
      await renderDashboard();
    } catch (error) {
      showLogin(error.message);
    }
  }

  async function handleLogout() {
    await api.logout().catch(() => {});
    showLogin();
  }

  async function renderDashboard() {
    renderLoading(container);

    let brokers;
    try {
      brokers = await api.listBrokers();
    } catch (error) {
      if (isSessionExpired(error)) return showLogin();
      return showLogin(error.message);
    }

    const content = renderAppShell(container, { onLogout: handleLogout });

    const brokersEl = document.createElement("div");
    const rebuildEl = document.createElement("div");
    content.append(brokersEl, rebuildEl);

    const onSessionExpired = () => showLogin("Sessão expirada. Entre novamente.");
    createBrokersSection(brokersEl, { onSessionExpired, initialBrokers: brokers });
    createRebuildSection(rebuildEl, { onSessionExpired });
  }

  renderDashboard();
}
