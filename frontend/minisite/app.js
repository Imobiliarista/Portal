// frontend/minisite/app.js
//
// Mirrors frontend/portal/app.js's shape (data → render, click
// interception for SPA navigation) but scoped to one broker resolved from
// the hostname (§74). Reuses frontend/portal/render.js for the imóvel
// completo page and the card markup — see that file's header comment.

import { resolveBrokerSlug, createDataClient } from "./data.js";
import { renderLoading, renderSiteNotFound, renderSuspended, renderProfile } from "./render.js";
import { renderListingDetail, renderNotFound } from "../portal/render.js";

function injectStylesheet() {
  if (document.querySelector("link[data-imob-minisite-styles]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/minisite/styles/main.css"; // absolute — see frontend/index.html's comment on modulePath
  link.dataset.imobMinisiteStyles = "true";
  document.head.append(link);
}

async function renderProfileRoute(container, dataClient, brokerSlug, profile) {
  const flat = await dataClient.listingsFlat(brokerSlug);
  if (flat) {
    renderProfile(container, { profile, cards: flat, hasMore: false }, {});
    return;
  }

  // §17 — broker cresceu além do arquivo único: mesma partição por shard da cidade.
  const manifest = await dataClient.listingsManifest(brokerSlug);
  const shardCount = manifest?.shards?.length ?? 0;
  if (shardCount === 0) {
    renderProfile(container, { profile, cards: [], hasMore: false }, {});
    return;
  }

  let cards = [];
  let cursor = 0;
  async function loadNextShard() {
    if (cursor >= shardCount) return;
    cursor += 1;
    const shardCards = (await dataClient.listingsShard(brokerSlug, cursor)) ?? [];
    cards = [...cards, ...shardCards];
    renderProfile(container, { profile, cards, hasMore: cursor < shardCount }, { onLoadMore: loadNextShard });
  }
  await loadNextShard();
}

export async function mount(container) {
  injectStylesheet();

  const brokerSlug = resolveBrokerSlug();
  if (!brokerSlug) {
    renderSiteNotFound(container); // §75 — hostname não é um minisite válido
    return;
  }

  const dataClient = createDataClient();

  async function renderCurrentRoute() {
    renderLoading(container);

    const profile = await dataClient.profile(brokerSlug);
    if (!profile) {
      renderSiteNotFound(container); // §75 — corretor não existe/não publicado
      return;
    }
    if (profile.status !== "active") {
      renderSuspended(container); // §76
      return;
    }

    const listingMatch = location.pathname.match(/^\/imovel\/([^/]+)\/?$/);
    if (listingMatch) {
      const listing = await dataClient.listing(decodeURIComponent(listingMatch[1]));
      if (!listing) {
        renderNotFound(container, "Imóvel não encontrado.");
        return;
      }
      renderListingDetail(container, listing);
      return;
    }

    await renderProfileRoute(container, dataClient, brokerSlug, profile);
  }

  container.addEventListener("click", (event) => {
    const anchor = event.target.closest?.("a");
    if (!anchor?.href) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    history.pushState({}, "", url.pathname + url.search);
    renderCurrentRoute();
  });
  window.addEventListener("popstate", () => renderCurrentRoute());

  await renderCurrentRoute();
}
