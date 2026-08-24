// frontend/admin/publishing.js
//
// Rebuild manual: por cidade, ou geral em lotes checkpointáveis (§33-34,
// §53, Etapa 8). Reaproveita business/publishing.js#rebuildCity/rebuildAll
// (Etapas 6/7) via worker/admin.js — este arquivo só dispara o gatilho e
// desenha o resultado, sem reimplementar a lógica de rebuild.

import * as api from "./data.js";
import { isSessionExpired } from "./data.js";
import { renderRebuildSection } from "./render.js";

/** `content` is a DOM node this controller owns exclusively. */
export function createRebuildSection(content, { onSessionExpired }) {
  let state = { running: false, result: undefined, error: undefined };

  function draw() {
    renderRebuildSection(content, state, {
      onRebuildCity: (citySlug) => run(() => api.rebuildCity(citySlug)),
      // `cursor` continues a previous "rebuild geral" batch (§34) — omitted
      // on the very first click, when there's no prior result yet.
      onRebuildAll: (cursor) => run(() => api.rebuildAll(cursor)),
    });
  }

  async function run(fn) {
    state = { ...state, running: true, error: undefined };
    draw();
    try {
      const result = await fn();
      state = { running: false, result, error: undefined };
      draw();
    } catch (error) {
      if (isSessionExpired(error)) return onSessionExpired();
      state = { ...state, running: false, error: error.message };
      draw();
    }
  }

  draw();
  return {};
}
