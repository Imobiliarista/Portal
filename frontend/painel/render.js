// frontend/painel/render.js
//
// DOM mounting for the painel (§54), same `el()`-builder convention as
// frontend/minisite/render.js. Verified visually (dev server + browser)
// rather than unit-tested, same convention noted in frontend/portal/render.js.

// modules/publications (§47): readPublicationsConfig is generated from
// modules/publications/index.js + config.js — see
// frontend/shared/publications.generated.js.
import { readPublicationsConfig } from "../shared/publications.generated.js";

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

// --- login (§54, consome POST /api/auth/login da Etapa 4) --------------------
export function renderLogin(container, { error, submitting } = {}, handlers = {}) {
  clear(container);

  const emailInput = el("input", { attrs: { type: "email", name: "email", required: "true", placeholder: "E-mail" } });
  const passwordInput = el("input", { attrs: { type: "password", name: "password", required: "true", placeholder: "Senha" } });
  const submit = el("button", { attrs: { type: "submit" }, text: submitting ? "Entrando…" : "Entrar" });
  if (submitting) submit.setAttribute("disabled", "true");

  // Built via el()'s children array (which drops falsy entries) rather than
  // a raw `.append()` call — native Element#append() stringifies a `null`
  // argument into a literal "null" text node instead of skipping it.
  const form = el("form", { className: "imob-login-form" }, [
    el("h1", { text: "Painel do corretor" }),
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
/** Draws the nav once and returns the content element for route-specific renderers to fill. */
export function renderAppShell(container, { activeRoute, brokerName } = {}, handlers = {}) {
  clear(container);

  const link = (href, text, routeName) =>
    el("a", { className: activeRoute === routeName ? "imob-nav-active" : "", text, attrs: { href } });

  const logoutButton = el("button", { className: "imob-logout", text: "Sair" });
  logoutButton.addEventListener("click", () => handlers.onLogout?.());

  const nav = el("nav", { className: "imob-nav" }, [
    el("span", { className: "imob-nav-broker", text: brokerName ?? "" }),
    link("/perfil", "Perfil", "profile"),
    link("/imoveis", "Imóveis", "listings"),
    logoutButton,
  ]);

  const content = el("div", { className: "imob-content" });
  container.append(nav, content);
  return content;
}

// --- perfil (§54, PUT /api/me/profile) ------------------------------------------
export function renderProfileForm(
  content,
  { profile, saving, error, saved, publicationsBusy, publicationsError, publicationsSaved } = {},
  handlers = {},
) {
  clear(content);

  const field = (labelText, name, value, type = "text") =>
    el("label", { className: "imob-field" }, [
      el("span", { text: labelText }),
      el("input", { attrs: { name, type }, value: value ?? "" }),
    ]);

  const form = el("form", { className: "imob-profile-form" }, [
    messageBox(error),
    saved ? messageBox("Perfil atualizado.", "success") : null,
    field("Nome", "name", profile?.name),
    field("E-mail", "email", profile?.email, "email"),
    field("CRECI", "creci", profile?.creci),
    field("Telefone", "phone", profile?.phone),
    field("WhatsApp", "whatsapp", profile?.whatsapp),
    field("Cidade", "city", profile?.city),
    el("label", { className: "imob-field" }, [
      el("span", { text: "Sobre" }),
      el("textarea", { attrs: { name: "about" }, text: profile?.about ?? "" }),
    ]),
    el("button", { attrs: { type: "submit" }, text: saving ? "Salvando…" : "Salvar" }),
  ]);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    handlers.onSubmit?.(Object.fromEntries(data.entries()));
  });

  const mediaSection = el("section", { className: "imob-profile-media" }, [
    el("h2", { text: "Logo e capa" }),
    renderMediaSlot("Logo", profile?.logo, (file) => handlers.onUploadLogo?.(file), () => handlers.onDeleteLogo?.()),
    renderMediaSlot("Capa", profile?.cover, (file) => handlers.onUploadCover?.(file), () => handlers.onDeleteCover?.()),
  ]);

  const publicationsForm = renderPublicationsForm(
    profile,
    { busy: publicationsBusy, error: publicationsError, saved: publicationsSaved },
    handlers,
  );

  content.append(el("h1", { text: "Meu perfil" }), form, mediaSection, publicationsForm);
}

// modules/publications (§47) — config no perfil público do corretor
// (`modules.publications: {enabled, feedUrl}`). Formulário separado do de
// cima: resolver o link do blog envolve rede (busca externa, ver
// frontend/painel/app.js#submitPublications) e não deveria travar/errar
// junto com os campos simples do perfil.
function renderPublicationsForm(profile, { busy, error, saved } = {}, handlers = {}) {
  const current = readPublicationsConfig(profile);

  const form = el("form", { className: "imob-publications-form" }, [
    el("h2", { text: "Publicações" }),
    messageBox(error),
    saved ? messageBox("Publicações atualizadas.", "success") : null,
    el("p", { className: "imob-message", text: current.feedUrl ? `Feed atual: ${current.feedUrl}` : "Nenhum blog configurado ainda." }),
    el("label", { className: "imob-field imob-field-checkbox" }, [
      el("input", { attrs: { type: "checkbox", name: "publicationsEnabled", ...(current.enabled ? { checked: "true" } : {}) } }),
      el("span", { text: "Mostrar publicações no minisite" }),
    ]),
    el("label", { className: "imob-field" }, [
      el("span", { text: "Link do blog (Blogger/Blogspot)" }),
      el("input", { attrs: { name: "publicationsBlogUrl", type: "url", placeholder: "https://seublog.blogspot.com" } }),
    ]),
    el("p", { className: "imob-hint", text: "Deixe em branco para manter o feed já configurado." }),
    el("button", { attrs: { type: "submit" }, text: busy ? "Verificando…" : "Salvar publicações" }),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    handlers.onSubmitPublications?.({
      enabled: data.get("publicationsEnabled") === "on",
      blogUrl: (data.get("publicationsBlogUrl") ?? "").toString().trim(),
    });
  });

  return form;
}

function renderMediaSlot(label, url, onUpload, onDelete) {
  const preview = url ? el("img", { className: "imob-media-preview", attrs: { src: url, alt: label } }) : null;
  const input = el("input", { attrs: { type: "file", accept: "image/webp,image/avif,image/jpeg,image/png" } });
  input.addEventListener("change", () => {
    if (input.files[0]) onUpload(input.files[0]);
  });
  const removeButton = url ? el("button", { attrs: { type: "button" }, text: "Remover" }) : null;
  removeButton?.addEventListener("click", () => onDelete());

  return el("div", { className: "imob-media-slot" }, [el("span", { text: label }), preview, input, removeButton]);
}

// --- imóveis: lista (§54, GET /api/me/listings) ---------------------------------
export function renderListingsList(content, { listings } = {}, handlers = {}) {
  clear(content);

  const newButton = el("button", { text: "Novo anúncio" });
  newButton.addEventListener("click", () => handlers.onNew?.());

  const items = (listings ?? []).map((listing) => {
    const editButton = el("button", { text: "Editar" });
    editButton.addEventListener("click", () => handlers.onEdit?.(listing.listingId));

    const deleteButton = el("button", { className: "imob-danger", text: "Excluir" });
    deleteButton.addEventListener("click", () => handlers.onDelete?.(listing.listingId));

    return el("li", { className: "imob-listing-row" }, [
      el("span", { className: "imob-listing-title", text: listing.title }),
      el("span", { className: `imob-status imob-status-${listing.status}`, text: listing.status }),
      editButton,
      listing.status !== "removed" ? deleteButton : null,
    ]);
  });

  content.append(
    el("h1", { text: "Meus imóveis" }),
    newButton,
    items.length
      ? el("ul", { className: "imob-listing-list" }, items)
      : el("p", { className: "imob-message", text: "Nenhum anúncio ainda." }),
  );
}

// --- imóveis: formulário criar/editar (§54, POST/PUT /api/me/listings) -----------
const PURPOSES = ["venda", "aluguel"];
const STATUSES = ["draft", "active", "paused", "sold"]; // "removed" só via botão Excluir

export function renderListingForm(content, { listing, mode, saving, error, uploading } = {}, handlers = {}) {
  clear(content);

  const field = (labelText, name, value, type = "text") =>
    el("label", { className: "imob-field" }, [
      el("span", { text: labelText }),
      el("input", { attrs: { name, type }, value: value ?? "" }),
    ]);

  const select = (labelText, name, options, current) =>
    el("label", { className: "imob-field" }, [
      el("span", { text: labelText }),
      el(
        "select",
        { attrs: { name } },
        options.map((opt) => {
          const optionEl = el("option", { text: opt, attrs: { value: opt } });
          if (opt === current) optionEl.setAttribute("selected", "true");
          return optionEl;
        }),
      ),
    ]);

  const f = listing?.features ?? {};

  const form = el("form", { className: "imob-listing-form" }, [
    messageBox(error),
    field("Título", "title", listing?.title),
    el("label", { className: "imob-field" }, [
      el("span", { text: "Descrição" }),
      el("textarea", { attrs: { name: "description" }, text: listing?.description ?? "" }),
    ]),
    select("Finalidade", "purpose", PURPOSES, listing?.purpose),
    field("Tipo", "type", listing?.type),
    mode === "edit" ? select("Status", "status", STATUSES, listing?.status) : null,
    field("Cidade", "city", listing?.city),
    field("Bairro", "district", listing?.district),
    field("CEP", "zipcode", listing?.zipcode),
    field("Preço", "price", listing?.price, "number"),
    field("Condomínio", "condominium", listing?.condominium, "number"),
    field("IPTU", "iptu", listing?.iptu, "number"),
    field("Latitude", "latitude", listing?.latitude, "number"),
    field("Longitude", "longitude", listing?.longitude, "number"),
    field("Quartos", "bedrooms", f.bedrooms, "number"),
    field("Banheiros", "bathrooms", f.bathrooms, "number"),
    field("Vagas", "parkingSpaces", f.parkingSpaces, "number"),
    field("Área (m²)", "area", f.area, "number"),
    field("Vídeo (link do YouTube)", "videoUrl", listing?.video ? `https://youtube.com/watch?v=${listing.video.id}` : ""),
    field("Tour 360 (URL)", "tour360Url", listing?.tour360?.url),
    el("button", { attrs: { type: "submit" }, text: saving ? "Salvando…" : "Salvar" }),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handlers.onSubmit?.(new FormData(form));
  });

  content.append(el("h1", { text: mode === "edit" ? "Editar anúncio" : "Novo anúncio" }), form);

  if (mode === "edit" && listing) {
    content.append(renderGallerySection(listing, uploading, handlers));

    const deleteButton = el("button", { className: "imob-danger", text: "Excluir anúncio" });
    deleteButton.addEventListener("click", () => handlers.onDeleteListing?.(listing.listingId));
    content.append(deleteButton);
  }
}

function renderGallerySection(listing, uploading, handlers) {
  const gallery = listing.gallery ?? [];

  const items = gallery.map((url) => {
    const removeButton = el("button", { text: "Remover" });
    removeButton.addEventListener("click", () => handlers.onDeletePhoto?.(url));
    return el("li", { className: "imob-gallery-item" }, [
      el("img", { attrs: { src: url, alt: "Foto do anúncio" } }),
      removeButton,
    ]);
  });

  const input = el("input", { attrs: { type: "file", accept: "image/webp,image/avif,image/jpeg,image/png" } });
  input.addEventListener("change", () => {
    if (input.files[0]) handlers.onUploadPhoto?.(input.files[0]);
  });

  return el("section", { className: "imob-gallery-section" }, [
    el("h2", { text: `Fotos (${gallery.length}/50)` }),
    uploading ? messageBox("Enviando foto…", "success") : null,
    el("ul", { className: "imob-gallery-list" }, items),
    input,
  ]);
}
