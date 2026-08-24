// frontend/admin/render.js
//
// DOM mounting for the SuperAdmin frontend (§53), same `el()`-builder
// convention as frontend/painel/render.js. Verified visually (dev server +
// browser) rather than unit-tested, same convention noted across
// frontend/*/render.js.

function el(tag, { className, text, attrs, value } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (value != null) node.value = value;
  if (attrs) for (const [key, val] of Object.entries(attrs)) node.setAttribute(key, val);
  for (const child of children) if (child) node.append(child);
  return node;
}

function clear(container) {
  container.replaceChildren();
}

export function renderLoading(container) {
  clear(container);
  container.append(el("p", { className: "imob-loading", text: "Carregando…" }));
}

function messageBox(text, kind = "error") {
  if (!text) return null;
  return el("p", { className: `imob-message imob-message-${kind}`, text });
}

// --- login (§53, consome POST /api/auth/login da Etapa 4) --------------------
export function renderLogin(container, { error, submitting } = {}, handlers = {}) {
  clear(container);

  const emailInput = el("input", { attrs: { type: "email", name: "email", required: "true", placeholder: "E-mail" } });
  const passwordInput = el("input", { attrs: { type: "password", name: "password", required: "true", placeholder: "Senha" } });
  const submit = el("button", { attrs: { type: "submit" }, text: submitting ? "Entrando…" : "Entrar" });
  if (submitting) submit.setAttribute("disabled", "true");

  const form = el("form", { className: "imob-login-form" }, [
    el("h1", { text: "SuperAdmin" }),
    messageBox(error),
    emailInput,
    passwordInput,
    submit,
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handlers.onLogin?.(emailInput.value.trim(), passwordInput.value);
  });

  container.append(el("div", { className: "imob-login-page" }, [form]));
}

// --- app shell: nav + content slot --------------------------------------------
export function renderAppShell(container, handlers = {}) {
  clear(container);

  const logoutButton = el("button", { className: "imob-logout", text: "Sair" });
  logoutButton.addEventListener("click", () => handlers.onLogout?.());

  const nav = el("nav", { className: "imob-nav" }, [
    el("span", { className: "imob-nav-title", text: "admin.imobiliarista.net" }),
    logoutButton,
  ]);

  const content = el("div", { className: "imob-content" });
  container.append(nav, content);
  return content;
}

// --- corretores: lista + ações (§53, GET/POST /api/admin/brokers*) --------------
const STATUS_LABELS = {
  pending: "Pendente",
  active: "Ativo",
  suspended: "Suspenso",
  disabled: "Desabilitado",
};

export function renderBrokersSection(content, { brokers, busyBrokerId, error } = {}, handlers = {}) {
  const rows = (brokers ?? []).map((broker) => {
    const busy = busyBrokerId === broker.brokerId;

    const approveButton =
      broker.status === "pending"
        ? el("button", { text: "Aprovar" }, [])
        : null;
    approveButton?.addEventListener("click", () => handlers.onApprove?.(broker.brokerId));

    const suspendButton =
      broker.status === "active" || broker.status === "pending"
        ? el("button", { className: "imob-danger", text: "Suspender" })
        : null;
    suspendButton?.addEventListener("click", () => handlers.onSuspend?.(broker.brokerId));

    const reactivateButton =
      broker.status === "suspended" ? el("button", { text: "Reativar" }) : null;
    reactivateButton?.addEventListener("click", () => handlers.onReactivate?.(broker.brokerId));

    const publishButton = el("button", { text: "Republicar" });
    publishButton.addEventListener("click", () => handlers.onPublish?.(broker.brokerId));

    for (const button of [approveButton, suspendButton, reactivateButton, publishButton]) {
      if (button && busy) button.setAttribute("disabled", "true");
    }

    return el("tr", {}, [
      el("td", { text: broker.name }),
      el("td", { text: broker.slug }),
      el("td", { text: broker.plan }),
      el(
        "td",
        { className: `imob-status imob-status-${broker.status}` },
        [el("span", { text: STATUS_LABELS[broker.status] ?? broker.status })],
      ),
      el("td", { className: "imob-actions" }, [approveButton, suspendButton, reactivateButton, publishButton]),
    ]);
  });

  const table = el("table", { className: "imob-brokers-table" }, [
    el("thead", {}, [
      el("tr", {}, [
        el("th", { text: "Nome" }),
        el("th", { text: "Slug" }),
        el("th", { text: "Plano" }),
        el("th", { text: "Status" }),
        el("th", { text: "Ações" }),
      ]),
    ]),
    el("tbody", {}, rows),
  ]);

  content.replaceChildren(
    el("section", { className: "imob-brokers-section" }, [
      el("h2", { text: "Corretores" }),
      messageBox(error),
      brokers?.length ? table : el("p", { className: "imob-message", text: "Nenhum corretor cadastrado ainda." }),
    ]),
  );
}

// --- rebuild manual (§53, §33-34, POST /api/admin/rebuild/*) -------------------
export function renderRebuildSection(content, { running, result, error } = {}, handlers = {}) {
  const cityInput = el("input", { attrs: { type: "text", name: "city", placeholder: "slug da cidade (ex.: londrina)" } });

  const rebuildCityButton = el("button", { text: "Rebuild da cidade" });
  rebuildCityButton.addEventListener("click", () => {
    if (cityInput.value.trim()) handlers.onRebuildCity?.(cityInput.value.trim());
  });

  const rebuildAllButton = el("button", { text: result && !result.done ? "Continuar rebuild geral" : "Rebuild geral" });
  rebuildAllButton.addEventListener("click", () => handlers.onRebuildAll?.(result?.nextCursor));

  if (running) {
    rebuildCityButton.setAttribute("disabled", "true");
    rebuildAllButton.setAttribute("disabled", "true");
  }

  const resultBox = result
    ? el("p", {
        className: "imob-message imob-message-success",
        text:
          "shards" in result
            ? `Cidade reconstruída: ${result.totalListings} anúncios em ${result.shards.length} shard(s).`
            : `Lote processado: ${result.processedCities.length} cidade(s). ${result.done ? "Concluído." : "Ainda há cidades pendentes — clique em continuar."}`,
      })
    : null;

  content.replaceChildren(
    el("section", { className: "imob-rebuild-section" }, [
      el("h2", { text: "Rebuild manual" }),
      messageBox(error),
      resultBox,
      el("div", { className: "imob-rebuild-city" }, [cityInput, rebuildCityButton]),
      el("div", { className: "imob-rebuild-all" }, [rebuildAllButton]),
    ]),
  );
}
