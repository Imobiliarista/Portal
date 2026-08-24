// frontend/admin/brokers.js
//
// Corretores: lista + aprovar/suspender/reativar/republicar (§53, Etapa 8).
// Thin controller wiring frontend/admin/data.js (API calls) to
// frontend/admin/render.js (DOM) — mirrors frontend/painel/app.js's
// draw-on-every-state-change pattern, scoped to just this section's slice
// of state instead of the whole app.

import * as api from "./data.js";
import { isSessionExpired } from "./data.js";
import { renderBrokersSection } from "./render.js";

/**
 * `content` is a DOM node this controller owns exclusively.
 * `onSessionExpired` bounces to the login screen (mirrors
 * frontend/painel/app.js#guarded). `initialBrokers`, when given, is drawn
 * immediately without a redundant fetch — the caller (frontend/admin/app.js)
 * already fetched the list once as its "am I logged in" probe.
 */
export function createBrokersSection(content, { onSessionExpired, initialBrokers }) {
  let state = { brokers: initialBrokers ?? [], busyBrokerId: null, error: undefined };
  draw();

  function draw() {
    renderBrokersSection(content, state, {
      onApprove: (brokerId) => runAction(brokerId, api.approveBroker),
      onSuspend: (brokerId) => runAction(brokerId, api.suspendBroker),
      onReactivate: (brokerId) => runAction(brokerId, api.reactivateBroker),
      onPublish: (brokerId) => runAction(brokerId, api.publishBroker),
    });
  }

  async function runAction(brokerId, action) {
    state = { ...state, busyBrokerId: brokerId, error: undefined };
    draw();
    try {
      await action(brokerId);
      await load();
    } catch (error) {
      if (isSessionExpired(error)) return onSessionExpired();
      state = { ...state, busyBrokerId: null, error: error.message };
      draw();
    }
  }

  async function load() {
    try {
      const brokers = await api.listBrokers();
      state = { brokers, busyBrokerId: null, error: undefined };
      draw();
    } catch (error) {
      if (isSessionExpired(error)) return onSessionExpired();
      state = { ...state, busyBrokerId: null, error: error.message };
      draw();
    }
  }

  return { load };
}
