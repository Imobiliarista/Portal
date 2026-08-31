// frontend/admin/brokers.js
//
// Corretores: lista + aprovar/suspender/reativar/republicar (§53, Etapa 8)
// + criar/ver/editar/excluir (gestão completa de cliente/site). Thin
// controller wiring frontend/admin/data.js (API calls) to
// frontend/admin/render.js (DOM) — mirrors frontend/painel/app.js's
// draw-on-every-state-change pattern, scoped to just this section's slice
// of state instead of the whole app.

import * as api from "./data.js";
import { isSessionExpired } from "./data.js";
import { renderBrokersSection, renderBrokerForm, renderLoading } from "./render.js";

/**
 * `content` is a DOM node this controller owns exclusively.
 * `onSessionExpired` bounces to the login screen (mirrors
 * frontend/painel/app.js#guarded). `initialBrokers`, when given, is drawn
 * immediately without a redundant fetch — the caller (frontend/admin/app.js)
 * already fetched the list once as its "am I logged in" probe.
 * `initialPlans`/`setPlans` (§52/§53, Etapa 8b) feed the per-row plan
 * picker — this controller never fetches plans itself, frontend/admin/app.js
 * owns keeping the two sections' plan lists in sync (frontend/admin/plans.js
 * is the source of truth for the catalog).
 */
export function createBrokersSection(content, { onSessionExpired, initialBrokers, initialPlans }) {
  // `view: "list" | "form"` toggles between the table (renderBrokersSection)
  // and the create/edit screen (renderBrokerForm) — same single-state,
  // redraw-on-change shape as the rest of this file, just with one more
  // dimension than the plans/rebuild sections need.
  let state = {
    view: "list",
    brokers: initialBrokers ?? [],
    plans: initialPlans ?? [],
    busyBrokerId: null,
    error: undefined,
    formMode: null,
    formBroker: null,
    formSaving: false,
    formDeleting: false,
    formError: undefined,
  };
  draw();

  function draw() {
    if (state.view === "form") {
      renderBrokerForm(
        content,
        { mode: state.formMode, broker: state.formBroker, saving: state.formSaving, deleting: state.formDeleting, error: state.formError },
        { onSubmit: handleFormSubmit, onDelete: handleDelete, onCancel: showList },
      );
      return;
    }
    renderBrokersSection(content, state, {
      onNew: showCreateForm,
      onEdit: showEditForm,
      onApprove: (brokerId) => runAction(brokerId, api.approveBroker),
      onSuspend: (brokerId) => runAction(brokerId, api.suspendBroker),
      onReactivate: (brokerId) => runAction(brokerId, api.reactivateBroker),
      onPublish: (brokerId) => runAction(brokerId, api.publishBroker),
      onAssignPlan: (brokerId, planId) => runAction(brokerId, () => api.assignBrokerPlan(brokerId, planId)),
    });
  }

  function showList() {
    state = { ...state, view: "list", formMode: null, formBroker: null, formError: undefined };
    draw();
  }

  function showCreateForm() {
    state = { ...state, view: "form", formMode: "create", formBroker: null, formError: undefined };
    draw();
  }

  async function showEditForm(brokerId) {
    renderLoading(content);
    try {
      const broker = await api.getBroker(brokerId);
      state = { ...state, view: "form", formMode: "edit", formBroker: broker, formError: undefined };
      draw();
    } catch (error) {
      if (isSessionExpired(error)) return onSessionExpired();
      state = { ...state, view: "list", error: error.message };
      draw();
    }
  }

  async function handleFormSubmit(fields, password) {
    state = { ...state, formSaving: true, formError: undefined };
    draw();
    try {
      if (state.formMode === "edit") {
        await api.updateBroker(state.formBroker.brokerId, fields);
      } else {
        await api.createBroker(fields, password);
      }
      await load();
      showList();
    } catch (error) {
      if (isSessionExpired(error)) return onSessionExpired();
      state = { ...state, formSaving: false, formError: error.message };
      draw();
    }
  }

  async function handleDelete(brokerId) {
    state = { ...state, formDeleting: true, formError: undefined };
    draw();
    try {
      await api.deleteBroker(brokerId);
      await load();
      showList();
    } catch (error) {
      if (isSessionExpired(error)) return onSessionExpired();
      state = { ...state, formDeleting: false, formError: error.message };
      draw();
    }
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
      state = { ...state, brokers, busyBrokerId: null, error: undefined };
      draw();
    } catch (error) {
      if (isSessionExpired(error)) return onSessionExpired();
      state = { ...state, busyBrokerId: null, error: error.message };
      draw();
    }
  }

  function setPlans(plans) {
    state = { ...state, plans };
    draw();
  }

  return { load, setPlans };
}
