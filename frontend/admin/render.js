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

  // §27 hotfix: CPF substituiu e-mail como identificador de login — ver
  // frontend/admin/data.js#login (PBKDF2 no navegador) e
  // business/brokers.js#getBrokerByCpf. §27 hotfix pt.2: o mesmo campo
  // também aceita o identificador especial MASTER (SuperAdmin de
  // homologação, business/auth.js#SPECIAL_IDENTIFIERS) — sem
  // `inputmode="numeric"` de propósito, para não atrapalhar digitar letras
  // num teclado mobile.
  const identifierInput = el("input", {
    attrs: { type: "text", name: "identifier", required: "true", placeholder: "CPF" },
  });
  const passwordInput = el("input", { attrs: { type: "password", name: "password", required: "true", placeholder: "Senha" } });
  const submit = el("button", { attrs: { type: "submit" }, text: submitting ? "Entrando…" : "Entrar" });
  if (submitting) submit.setAttribute("disabled", "true");

  const form = el("form", { className: "imob-login-form" }, [
    el("h1", { text: "SuperAdmin" }),
    messageBox(error),
    identifierInput,
    passwordInput,
    submit,
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handlers.onLogin?.(identifierInput.value.trim(), passwordInput.value);
  });

  container.append(el("div", { className: "imob-login-page" }, [form]));
}

// --- app shell: nav + content slot --------------------------------------------
export function renderAppShell(container, handlers = {}) {
  clear(container);

  const logoutButton = el("button", { className: "imob-logout", text: "Sair" });
  logoutButton.addEventListener("click", () => handlers.onLogout?.());

  const nav = el("nav", { className: "imob-nav" }, [
    el("span", { className: "imob-nav-title", text: "imobiliarista.net/admin" }),
    logoutButton,
  ]);

  const content = el("div", { className: "imob-content" });
  container.append(nav, content);
  return content;
}

// --- corretores: lista + ações (§53, GET/POST /api/admin/brokers*; gestão
// completa de cliente/site) -----------------------------------------------
const STATUS_LABELS = {
  pending: "Pendente",
  active: "Ativo",
  suspended: "Suspenso",
  disabled: "Desabilitado",
  deleted: "Excluído",
};

export function renderBrokersSection(content, { brokers, plans, busyBrokerId, error } = {}, handlers = {}) {
  const newButton = el("button", { text: "Novo cliente" });
  newButton.addEventListener("click", () => handlers.onNew?.());

  const rows = (brokers ?? []).map((broker) => {
    const busy = busyBrokerId === broker.brokerId;

    // Etapa 8b (§52/§53): atribuir/trocar plano — dispara na hora
    // (onChange), sem botão "salvar" separado, mesma imediatidade das
    // ações de status ao lado.
    const planOptions = (plans ?? []).map((plan) =>
      el("option", { text: `${plan.name} (${plan.planId})`, value: plan.planId }),
    );
    const planSelect = el("select", { className: "imob-plan-select" }, planOptions);
    planSelect.value = broker.plan ?? "";
    planSelect.addEventListener("change", () => handlers.onAssignPlan?.(broker.brokerId, planSelect.value));
    if (busy || !plans?.length) planSelect.setAttribute("disabled", "true");

    const editButton = el("button", { text: "Editar", attrs: { type: "button" } });
    editButton.addEventListener("click", () => handlers.onEdit?.(broker.brokerId));

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

    const publishButton =
      broker.status === "deleted" ? null : el("button", { text: "Republicar" });
    publishButton?.addEventListener("click", () => handlers.onPublish?.(broker.brokerId));

    for (const button of [editButton, approveButton, suspendButton, reactivateButton, publishButton]) {
      if (button && busy) button.setAttribute("disabled", "true");
    }

    return el("tr", {}, [
      el("td", { text: broker.name }),
      el("td", { text: broker.slug }),
      el("td", { className: "imob-plan-cell" }, [planSelect]),
      el(
        "td",
        { className: `imob-status imob-status-${broker.status}` },
        [el("span", { text: STATUS_LABELS[broker.status] ?? broker.status })],
      ),
      el("td", { className: "imob-actions" }, [editButton, approveButton, suspendButton, reactivateButton, publishButton]),
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
      newButton,
      brokers?.length ? table : el("p", { className: "imob-message", text: "Nenhum corretor cadastrado ainda." }),
    ]),
  );
}

// --- corretor: criar/editar (gestão completa de cliente/site) --------------
// Um único formulário para os dois modos ("create"/"edit"), mesma
// preferência de `draw()` state-driven do resto deste arquivo
// (renderPlansSection acima já faz o mesmo criar/editar num só form).
// Campos organizados em DOIS grupos visuais claros — "Dados do cliente
// (privado)" e "Dados do site (público)" — pra ninguém confundir os dois
// na hora de preencher, como pedido: cliente e site são a mesma entidade
// (1:1), só com visibilidade diferente depois de publicados.
function addressFieldset(legendText, prefix, current) {
  const addr = current ?? {};
  const input = (labelText, name, value) =>
    el("label", { className: "imob-field" }, [
      el("span", { text: labelText }),
      el("input", { attrs: { name: `${prefix}.${name}` }, value: value ?? "" }),
    ]);

  return {
    fieldset: el("fieldset", { className: "imob-field-group" }, [
      el("legend", { text: legendText }),
      input("País", "country", addr.country),
      input("Estado", "state", addr.state),
      input("Cidade", "city", addr.city),
      input("Rua", "street", addr.street),
      input("Número", "streetNumber", addr.streetNumber),
      input("Complemento (opcional)", "complement", addr.complement),
      input("CEP", "zipcode", addr.zipcode),
    ]),
  };
}

function readAddressFromForm(form, prefix) {
  const get = (name) => form.querySelector(`[name="${prefix}.${name}"]`)?.value.trim() ?? "";
  const complement = get("complement");
  const address = {
    country: get("country"),
    state: get("state"),
    city: get("city"),
    street: get("street"),
    streetNumber: get("streetNumber"),
    zipcode: get("zipcode"),
    ...(complement ? { complement } : {}),
  };
  // Endereço inteiramente vazio (formulário deixado em branco) não vira um
  // objeto de campos vazios inválido — simplesmente não é enviado.
  return Object.values(address).some((v) => v) ? address : undefined;
}

export function renderBrokerForm(content, { mode, broker, saving, deleting, error } = {}, handlers = {}) {
  const editing = mode === "edit";

  const field = (labelText, name, value, { type = "text", disabled } = {}) =>
    el("label", { className: "imob-field" }, [
      el("span", { text: labelText }),
      el("input", { attrs: { name, type, ...(disabled ? { disabled: "true" } : {}) }, value: value ?? "" }),
    ]);

  const personalAddress = addressFieldset("Endereço pessoal", "personalAddress", broker?.personalAddress);
  const businessAddress = addressFieldset("Endereço comercial", "businessAddress", broker?.businessAddress);

  const clientFields = el("fieldset", { className: "imob-field-group" }, [
    el("legend", { text: "Dados do cliente (privado)" }),
    field("Nome completo", "fullName", broker?.fullName),
    field("Data de nascimento", "birthDate", broker?.birthDate, { type: "date" }),
    field("Nacionalidade", "nationality", broker?.nationality),
    field("CPF", "cpf", broker?.cpf),
    field("E-mail (privado)", "email", broker?.email, { type: "email" }),
    field("Telefone (privado)", "phone", broker?.phone),
    personalAddress.fieldset,
    ...(editing ? [] : [field("Senha inicial", "password", "", { type: "password" })]),
  ]);

  const siteFields = el("fieldset", { className: "imob-field-group" }, [
    el("legend", { text: "Dados do site (público)" }),
    field("Nome de exibição", "name", broker?.name),
    field("Slug (URL do site)", "slug", broker?.slug, { disabled: editing }),
    field("Plano", "plan", broker?.plan, { disabled: editing }),
    field("CRECI", "creci", broker?.creci),
    field("WhatsApp", "whatsapp", broker?.whatsapp),
    field("Cidade de atuação", "city", broker?.city),
    field("Telefone comercial", "businessPhone", broker?.businessPhone),
    field("E-mail comercial", "businessEmail", broker?.businessEmail, { type: "email" }),
    businessAddress.fieldset,
    el("label", { className: "imob-field" }, [
      el("span", { text: "Sobre" }),
      el("textarea", { attrs: { name: "about" }, text: broker?.about ?? "" }),
    ]),
    field("Logo (URL)", "logo", broker?.logo),
    field("Capa (URL)", "cover", broker?.cover),
  ]);

  const submitButton = el("button", {
    attrs: { type: "submit" },
    text: saving ? "Salvando…" : editing ? "Salvar" : "Criar cliente/site",
  });
  if (saving) submitButton.setAttribute("disabled", "true");

  const cancelButton = el("button", { className: "imob-danger", text: "Cancelar", attrs: { type: "button" } });
  cancelButton.addEventListener("click", () => handlers.onCancel?.());

  const form = el("form", { className: "imob-broker-form" }, [messageBox(error), clientFields, siteFields, submitButton, cancelButton]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = (name) => form.querySelector(`[name="${name}"]`)?.value.trim() ?? "";
    const optional = (name) => value(name) || undefined;

    const fields = {
      name: value("name"),
      creci: optional("creci"),
      whatsapp: optional("whatsapp"),
      city: optional("city"),
      about: optional("about"),
      logo: optional("logo"),
      cover: optional("cover"),
      businessPhone: optional("businessPhone"),
      businessEmail: optional("businessEmail"),
      businessAddress: readAddressFromForm(form, "businessAddress"),
      fullName: optional("fullName"),
      birthDate: optional("birthDate"),
      nationality: optional("nationality"),
      email: optional("email"),
      phone: optional("phone"),
      personalAddress: readAddressFromForm(form, "personalAddress"),
      cpf: optional("cpf"),
      // slug/plan são imutáveis após a criação (business/brokers.js#
      // PROFILE_UPDATE_ALLOWED_FIELDS não os inclui) — só enviados no create.
      ...(editing ? {} : { slug: value("slug"), plan: value("plan") }),
    };

    if (editing) {
      handlers.onSubmit?.(fields);
    } else {
      handlers.onSubmit?.(fields, value("password"));
    }
  });

  const deleteButton =
    editing && broker?.status !== "deleted"
      ? el("button", { className: "imob-danger", text: deleting ? "Excluindo…" : "Excluir cliente/site", attrs: { type: "button" } })
      : null;
  if (deleteButton) {
    if (deleting) deleteButton.setAttribute("disabled", "true");
    deleteButton.addEventListener("click", () => {
      // Ação destrutiva (muda status pra "deleted" permanentemente) — pede
      // confirmação explícita antes de executar, mesmo padrão nativo do
      // navegador que este painel usa pra qualquer ação irreversível.
      if (window.confirm(`Excluir "${broker?.name}"? Essa ação marca o cliente/site como excluído e não pode ser desfeita por aqui.`)) {
        handlers.onDelete?.(broker.brokerId);
      }
    });
  }

  content.replaceChildren(
    el("section", { className: "imob-broker-form-section" }, [
      el("h2", { text: editing ? `Editar: ${broker?.name ?? ""}` : "Novo cliente/site" }),
      form,
      deleteButton,
    ]),
  );
}

// --- planos (§52, §53, Etapa 8b + Etapa 10, /api/admin/plans*) -----------------
// Single form, toggling between "criar" e "editar" (`editingPlanId` in
// state) instead of two separate forms — mirrors the rest of this file's
// preference for one state-driven draw() over parallel DOM trees. Etapa
// 10 (§52) added price/limite de anúncios/módulos fields to the same
// form — não recriado do zero.
//
// `PLAN_MODULE_FIELDS` mirrors business/plans.js#PLAN_MODULE_KEYS by
// value (frontend/admin never imports business/* or modules/*, same
// boundary every other frontend/*.js in this repo keeps — Workers Static
// Assets only publishes frontend/). Adding a module there later needs the
// matching entry added here too; there's no generator keeping the two in
// sync in this lot.
const PLAN_MODULE_FIELDS = [
  { key: "publications", label: "Publicações (feed Blogger)" },
  { key: "feeds", label: "Feeds para portais externos (OLX/ZAP/VivaReal)" },
];

const planCurrencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatPlanPrice(value) {
  return typeof value === "number" ? planCurrencyFormatter.format(value) : planCurrencyFormatter.format(0);
}

export function renderPlansSection(content, { plans, editingPlanId, busyPlanId, error } = {}, handlers = {}) {
  const editing = (plans ?? []).find((plan) => plan.planId === editingPlanId);

  const planIdInput = el("input", {
    attrs: { type: "text", name: "planId", placeholder: "id (ex.: premium)", required: "true" },
  });
  const nameInput = el("input", {
    attrs: { type: "text", name: "name", placeholder: "Nome", required: "true" },
    value: editing?.name,
  });
  const monthlyPriceInput = el("input", {
    attrs: { type: "number", name: "monthlyPrice", placeholder: "Mensalidade (R$)", min: "0", step: "0.01" },
    value: editing?.monthlyPrice ?? 0,
  });
  const setupPriceInput = el("input", {
    attrs: { type: "number", name: "setupPrice", placeholder: "Implantação (R$)", min: "0", step: "0.01" },
    value: editing?.setupPrice ?? 0,
  });
  const maxGalleryInput = el("input", {
    attrs: { type: "number", name: "maxGalleryItems", placeholder: "Limite de fotos por anúncio", min: "1", required: "true" },
    value: editing?.maxGalleryItems,
  });
  const maxActiveListingsInput = el("input", {
    attrs: { type: "number", name: "maxActiveListings", placeholder: "Limite de anúncios (vazio = ilimitado)", min: "1" },
    value: editing?.maxActiveListings ?? "",
  });

  if (editing) {
    planIdInput.value = editing.planId;
    planIdInput.setAttribute("disabled", "true"); // planId é imutável após criado
  }

  const moduleCheckboxes = PLAN_MODULE_FIELDS.map(({ key, label }) => {
    const checkbox = el("input", {
      attrs: { type: "checkbox", name: `module-${key}`, ...(editing?.modules?.[key] ? { checked: "true" } : {}) },
    });
    const field = el("label", { className: "imob-field imob-field-checkbox" }, [checkbox, el("span", { text: label })]);
    return { key, checkbox, field };
  });

  const cancelButton = editing ? el("button", { className: "imob-danger", text: "Cancelar edição", attrs: { type: "button" } }) : null;
  cancelButton?.addEventListener("click", () => handlers.onCancelEdit?.());

  const submitButton = el("button", { attrs: { type: "submit" }, text: editing ? "Salvar plano" : "Criar plano" });

  const form = el("form", { className: "imob-plan-form" }, [
    planIdInput,
    nameInput,
    monthlyPriceInput,
    setupPriceInput,
    maxGalleryInput,
    maxActiveListingsInput,
    el("fieldset", { className: "imob-plan-modules" }, [
      el("legend", { text: "Módulos inclusos" }),
      ...moduleCheckboxes.map((m) => m.field),
    ]),
    submitButton,
    cancelButton,
  ]);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const maxActiveListingsRaw = maxActiveListingsInput.value.trim();
    const input = {
      name: nameInput.value.trim(),
      monthlyPrice: Number(monthlyPriceInput.value || 0),
      setupPrice: Number(setupPriceInput.value || 0),
      maxGalleryItems: Number(maxGalleryInput.value),
      maxActiveListings: maxActiveListingsRaw === "" ? null : Number(maxActiveListingsRaw),
      modules: Object.fromEntries(moduleCheckboxes.map((m) => [m.key, m.checkbox.checked])),
    };
    if (editing) {
      handlers.onUpdate?.(editing.planId, input);
    } else {
      handlers.onCreate?.({ ...input, planId: planIdInput.value.trim() });
    }
  });

  const rows = (plans ?? []).map((plan) => {
    const busy = busyPlanId === plan.planId;
    // "free" mirrors business/plans.js's DEFAULT_PLAN_ID — not imported
    // (frontend/admin never imports business/*, same boundary every other
    // frontend/*.js in this repo keeps), just the same literal server-side
    // deletePlan() already refuses to remove.
    const isDefault = plan.planId === "free";

    const editButton = el("button", { text: "Editar", attrs: { type: "button" } });
    editButton.addEventListener("click", () => handlers.onStartEdit?.(plan.planId));

    const deleteButton = el("button", { className: "imob-danger", text: "Remover", attrs: { type: "button" } });
    deleteButton.addEventListener("click", () => handlers.onDelete?.(plan.planId));
    if (isDefault) {
      deleteButton.setAttribute("disabled", "true");
      deleteButton.title = "O plano padrão não pode ser removido.";
    }

    for (const button of [editButton, deleteButton]) {
      if (busy) button.setAttribute("disabled", "true");
    }

    const enabledModules = PLAN_MODULE_FIELDS.filter((m) => plan.modules?.[m.key]).map((m) => m.label);

    return el("tr", {}, [
      el("td", { text: plan.name }),
      el("td", { text: plan.planId }),
      el("td", { text: formatPlanPrice(plan.monthlyPrice) }),
      el("td", { text: formatPlanPrice(plan.setupPrice) }),
      el("td", { text: String(plan.maxGalleryItems) }),
      el("td", { text: plan.maxActiveListings != null ? String(plan.maxActiveListings) : "Ilimitado" }),
      el("td", { text: enabledModules.length ? enabledModules.join(", ") : "—" }),
      el("td", { className: "imob-actions" }, [editButton, deleteButton]),
    ]);
  });

  const table = el("table", { className: "imob-plans-table" }, [
    el("thead", {}, [
      el("tr", {}, [
        el("th", { text: "Nome" }),
        el("th", { text: "ID" }),
        el("th", { text: "Mensalidade" }),
        el("th", { text: "Implantação" }),
        el("th", { text: "Limite de fotos" }),
        el("th", { text: "Limite de anúncios" }),
        el("th", { text: "Módulos" }),
        el("th", { text: "Ações" }),
      ]),
    ]),
    el("tbody", {}, rows),
  ]);

  content.replaceChildren(
    el("section", { className: "imob-plans-section" }, [
      el("h2", { text: "Planos" }),
      messageBox(error),
      plans?.length ? table : el("p", { className: "imob-message", text: "Nenhum plano cadastrado ainda." }),
      form,
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
