// frontend/admin/plans.js
//
// Planos: CRUD (§52, §53, Etapa 8b). Thin controller wiring
// frontend/admin/data.js (API calls) to frontend/admin/render.js (DOM) —
// mirrors frontend/admin/brokers.js's draw-on-every-state-change pattern.

import * as api from "./data.js";
import { isSessionExpired } from "./data.js";
import { renderPlansSection } from "./render.js";

/**
 * `content` is a DOM node this controller owns exclusively.
 * `onSessionExpired` bounces to the login screen. `onPlansChanged(plans)`
 * lets the caller (frontend/admin/app.js) keep the brokers section's plan
 * picker in sync without this controller knowing about brokers at all.
 */
export function createPlansSection(content, { onSessionExpired, onPlansChanged, initialPlans }) {
  let state = { plans: initialPlans ?? [], editingPlanId: null, busyPlanId: null, error: undefined };
  draw();
  if (initialPlans === undefined) load();

  function draw() {
    renderPlansSection(content, state, {
      onCreate: (input) => runMutation(() => api.createPlan(input)),
      onUpdate: (planId, patch) => runMutation(() => api.updatePlan(planId, patch)),
      onDelete: (planId) => runAction(planId, () => api.deletePlan(planId)),
      onStartEdit: (planId) => {
        state = { ...state, editingPlanId: planId, error: undefined };
        draw();
      },
      onCancelEdit: () => {
        state = { ...state, editingPlanId: null, error: undefined };
        draw();
      },
    });
  }

  async function runMutation(fn) {
    state = { ...state, error: undefined };
    draw();
    try {
      await fn();
      state = { ...state, editingPlanId: null };
      await load();
    } catch (error) {
      if (isSessionExpired(error)) return onSessionExpired();
      state = { ...state, error: error.message };
      draw();
    }
  }

  async function runAction(planId, fn) {
    state = { ...state, busyPlanId: planId, error: undefined };
    draw();
    try {
      await fn();
      await load();
    } catch (error) {
      if (isSessionExpired(error)) return onSessionExpired();
      state = { ...state, busyPlanId: null, error: error.message };
      draw();
    }
  }

  async function load() {
    try {
      const plans = await api.listPlans();
      state = { plans, editingPlanId: null, busyPlanId: null, error: undefined };
      draw();
      onPlansChanged?.(plans);
    } catch (error) {
      if (isSessionExpired(error)) return onSessionExpired();
      state = { ...state, busyPlanId: null, error: error.message };
      draw();
    }
  }

  return { load };
}
