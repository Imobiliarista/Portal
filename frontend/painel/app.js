// frontend/painel/app.js
//
// Wires router + data + forms + render together for the painel do corretor
// (§54). Session state isn't tracked as a boolean flag — this file treats
// "GET /api/me/profile succeeds" as the source of truth for "am I logged
// in", and any 401 from any /api/me/* call (session expired mid-use, not
// just on load) as the signal to bounce back to the login screen (§54
// "tratamento de sessão expirada").

import { parseRoute } from "./router.js";
import * as api from "./data.js";
import { isSessionExpired, mediaIdFromUrl } from "./data.js";
import {
  renderLoading,
  renderLogin,
  renderAppShell,
  renderProfileForm,
  renderListingsList,
  renderListingForm,
} from "./render.js";
import { buildProfilePatch, buildListingPayload } from "./forms.js";
import { assertUploadableImage, ClientMediaValidationError } from "./media.js";

function injectStylesheet() {
  if (document.querySelector("link[data-imob-painel-styles]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/painel/styles/main.css"; // absolute — same reasoning as frontend/portal/app.js
  link.dataset.imobPainelStyles = "true";
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
      await api.login(email, password);
      history.pushState({}, "", "/imoveis");
      await renderCurrentRoute();
    } catch (error) {
      showLogin(error.message);
    }
  }

  async function handleLogout() {
    await api.logout().catch(() => {});
    history.pushState({}, "", "/");
    showLogin();
  }

  /** Runs `fn`; on a 401 from any /api/me/* call, bounces to the login screen instead of propagating. Returns `undefined` when that happened (callers must bail out). */
  async function guarded(contentEl, fn) {
    try {
      return await fn();
    } catch (error) {
      if (isSessionExpired(error)) {
        showLogin("Sessão expirada. Entre novamente.");
        return undefined;
      }
      throw error;
    }
  }

  // --- perfil -----------------------------------------------------------------
  async function renderProfileRoute() {
    const contentEl = renderAppShell(container, { activeRoute: "profile" }, { onLogout: handleLogout });
    renderLoading(contentEl);

    const profile = await guarded(contentEl, () => api.getProfile());
    if (!profile) return;

    drawProfile(contentEl, profile, {});
  }

  function drawProfile(contentEl, profile, { error, saving, saved } = {}) {
    renderProfileForm(contentEl, { profile, error, saving, saved }, {
      onSubmit: async (entries) => {
        drawProfile(contentEl, profile, { saving: true });
        try {
          const updated = await api.updateProfile(buildProfilePatch(entries));
          drawProfile(contentEl, updated, { saved: true });
        } catch (submitError) {
          if (isSessionExpired(submitError)) return showLogin("Sessão expirada. Entre novamente.");
          drawProfile(contentEl, profile, { error: submitError.message });
        }
      },
      onUploadLogo: (file) => uploadProfileMedia(contentEl, profile, file, "broker-logo"),
      onUploadCover: (file) => uploadProfileMedia(contentEl, profile, file, "broker-cover"),
      onDeleteLogo: () => deleteProfileMedia(contentEl, profile, "logo"),
      onDeleteCover: () => deleteProfileMedia(contentEl, profile, "cover"),
    });
  }

  async function uploadProfileMedia(contentEl, profile, file, target) {
    try {
      assertUploadableImage(file);
    } catch (validationError) {
      if (validationError instanceof ClientMediaValidationError) {
        return drawProfile(contentEl, profile, { error: validationError.message });
      }
      throw validationError;
    }
    try {
      await api.uploadMedia(file, target);
      const updated = await api.getProfile();
      drawProfile(contentEl, updated, { saved: true });
    } catch (uploadError) {
      if (isSessionExpired(uploadError)) return showLogin("Sessão expirada. Entre novamente.");
      drawProfile(contentEl, profile, { error: uploadError.message });
    }
  }

  async function deleteProfileMedia(contentEl, profile, field) {
    const url = field === "logo" ? profile.logo : profile.cover;
    const id = mediaIdFromUrl(url);
    if (!id) return drawProfile(contentEl, profile, { error: "Não foi possível identificar o arquivo." });
    try {
      await api.deleteMedia(id);
      const updated = await api.getProfile();
      drawProfile(contentEl, updated, { saved: true });
    } catch (deleteError) {
      if (isSessionExpired(deleteError)) return showLogin("Sessão expirada. Entre novamente.");
      drawProfile(contentEl, profile, { error: deleteError.message });
    }
  }

  // --- imóveis: lista -----------------------------------------------------------
  async function renderListingsRoute() {
    const contentEl = renderAppShell(container, { activeRoute: "listings" }, { onLogout: handleLogout });
    renderLoading(contentEl);

    const listings = await guarded(contentEl, () => api.listListings());
    if (!listings) return;

    renderListingsList(contentEl, { listings }, {
      onNew: () => goto("/imoveis/novo"),
      onEdit: (id) => goto(`/imoveis/${id}`),
      onDelete: async (id) => {
        try {
          await api.deleteListing(id);
          await renderListingsRoute();
        } catch (deleteError) {
          if (isSessionExpired(deleteError)) return showLogin("Sessão expirada. Entre novamente.");
          renderListingsList(contentEl, { listings }, { onNew: () => goto("/imoveis/novo"), onEdit: (i) => goto(`/imoveis/${i}`) });
        }
      },
    });
  }

  // --- imóveis: novo -------------------------------------------------------------
  async function renderListingNewRoute() {
    const contentEl = renderAppShell(container, { activeRoute: "listings" }, { onLogout: handleLogout });
    drawListingForm(contentEl, { mode: "new", listing: null }, {});
  }

  // --- imóveis: editar -------------------------------------------------------------
  async function renderListingEditRoute(id) {
    const contentEl = renderAppShell(container, { activeRoute: "listings" }, { onLogout: handleLogout });
    renderLoading(contentEl);

    const listing = await guarded(contentEl, () => api.getListing(id));
    if (!listing) return;

    drawListingForm(contentEl, { mode: "edit", listing }, {});
  }

  function drawListingForm(contentEl, { mode, listing }, { error, saving, uploading } = {}) {
    renderListingForm(contentEl, { listing, mode, saving, error, uploading }, {
      onSubmit: async (formData) => {
        drawListingForm(contentEl, { mode, listing }, { saving: true });
        const payload = buildListingPayload(formData);
        try {
          const saved =
            mode === "new" ? await api.createListing(withSlug(payload)) : await api.updateListing(listing.listingId, payload);
          await goto(`/imoveis/${saved.listingId}`);
        } catch (submitError) {
          if (isSessionExpired(submitError)) return showLogin("Sessão expirada. Entre novamente.");
          drawListingForm(contentEl, { mode, listing }, { error: submitError.message });
        }
      },
      onDeleteListing: async (id) => {
        try {
          await api.deleteListing(id);
          await goto("/imoveis");
        } catch (deleteError) {
          if (isSessionExpired(deleteError)) return showLogin("Sessão expirada. Entre novamente.");
          drawListingForm(contentEl, { mode, listing }, { error: deleteError.message });
        }
      },
      onUploadPhoto: async (file) => {
        try {
          assertUploadableImage(file);
        } catch (validationError) {
          if (validationError instanceof ClientMediaValidationError) {
            return drawListingForm(contentEl, { mode, listing }, { error: validationError.message });
          }
          throw validationError;
        }
        drawListingForm(contentEl, { mode, listing }, { uploading: true });
        try {
          await api.uploadMedia(file, "listing-gallery", listing.listingId);
          const updated = await api.getListing(listing.listingId);
          drawListingForm(contentEl, { mode, listing: updated }, {});
        } catch (uploadError) {
          if (isSessionExpired(uploadError)) return showLogin("Sessão expirada. Entre novamente.");
          drawListingForm(contentEl, { mode, listing }, { error: uploadError.message });
        }
      },
      onDeletePhoto: async (url) => {
        const id = mediaIdFromUrl(url);
        if (!id) return drawListingForm(contentEl, { mode, listing }, { error: "Não foi possível identificar o arquivo." });
        try {
          await api.deleteMedia(id);
          const updated = await api.getListing(listing.listingId);
          drawListingForm(contentEl, { mode, listing: updated }, {});
        } catch (deleteError) {
          if (isSessionExpired(deleteError)) return showLogin("Sessão expirada. Entre novamente.");
          drawListingForm(contentEl, { mode, listing }, { error: deleteError.message });
        }
      },
    });
  }

  function withSlug(payload) {
    // A first pass: derive a slug from the title if the form didn't collect
    // one explicitly. Kept minimal — collision handling surfaces the
    // server's ListingConflictError message as-is (§30 slug uniqueness is
    // business/listings.js's job, not reimplemented here).
    if (payload.slug) return payload;
    const base = (payload.title ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip diacritics after NFD decomposition
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return { ...payload, slug: `${base || "imovel"}-${Date.now().toString(36)}` };
  }

  async function goto(path) {
    history.pushState({}, "", path);
    await renderCurrentRoute();
  }

  async function renderCurrentRoute() {
    const route = parseRoute(location.pathname);
    if (route.name === "dashboard") return renderListingsRoute();
    if (route.name === "profile") return renderProfileRoute();
    if (route.name === "listings") return renderListingsRoute();
    if (route.name === "listing-new") return renderListingNewRoute();
    if (route.name === "listing-edit") return renderListingEditRoute(route.id);
    return renderListingsRoute();
  }

  container.addEventListener("click", (event) => {
    const anchor = event.target.closest?.("a");
    if (!anchor?.href) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    goto(url.pathname + url.search);
  });
  window.addEventListener("popstate", () => renderCurrentRoute());

  // Initial load: GET /api/me/profile doubles as the "am I logged in?" probe.
  renderLoading(container);
  api
    .getProfile()
    .then(() => renderCurrentRoute())
    .catch((error) => {
      if (isSessionExpired(error)) return showLogin();
      showLogin(error.message);
    });
}
