// frontend/portal/app.js
//
// Wires router + data + filters + render together and owns the only
// impure bits (history, DOM events). Everything it calls into
// (router.js, data.js, filters.js, the view-model builders in render.js)
// is pure and independently unit-tested; this file is verified visually
// (§90 Etapa 2 — "start the dev server and use the feature in a browser").

import { parseRoute } from "./router.js";
import { createDataClient } from "./data.js";
import { filterCards, sortCards, shardsNeededForFilters } from "./filters.js";
import {
  renderLoading,
  renderNotFound,
  renderEmptyCity,
  renderHome,
  renderCityView,
  renderListingDetail,
} from "./render.js";

function injectStylesheet() {
  if (document.querySelector('link[data-imob-portal-styles]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/portal/styles/main.css"; // absolute — see frontend/index.html's comment on modulePath
  link.dataset.imobPortalStyles = "true";
  document.head.append(link);
}

async function renderHomeRoute(container, dataClient) {
  renderLoading(container);
  const cities = await dataClient.portalCities();
  renderHome(container, { cities: cities ?? [] });
}

async function renderCityRoute(container, dataClient, route) {
  renderLoading(container);
  const { citySlug, filters, sortBy } = route;

  const manifest = await dataClient.cityManifest(citySlug);
  if (!manifest) {
    renderNotFound(container, `Cidade "${citySlug}" não encontrada.`);
    return;
  }
  if (!manifest.shards || manifest.shards.length === 0) {
    renderEmptyCity(container, citySlug); // §77
    return;
  }

  // §21-22: use the compact index (when published) to fetch only the
  // shards that can contain a match, instead of the whole city.
  const index = await dataClient.cityIndex(citySlug);
  const shardPlan = index ? shardsNeededForFilters(index, filters) : manifest.shards.map((_, i) => i + 1);

  let cards = [];
  let cursor = 0;

  async function loadNextShard() {
    if (cursor >= shardPlan.length) return;
    const shardNumber = shardPlan[cursor];
    cursor += 1;
    const shardCards = (await dataClient.cityShard(citySlug, shardNumber)) ?? [];
    cards = sortCards([...cards, ...filterCards(shardCards, filters)], sortBy);
    renderCityView(
      container,
      { manifest, citySlug, cards, hasMore: cursor < shardPlan.length },
      { onLoadMore: loadNextShard },
    );
  }

  if (shardPlan.length === 0) {
    renderCityView(container, { manifest, citySlug, cards: [], hasMore: false }, {});
    return;
  }

  await loadNextShard();
}

async function renderListingRoute(container, dataClient, route) {
  renderLoading(container);
  const listing = await dataClient.listing(route.slug);
  if (!listing) {
    renderNotFound(container, "Imóvel não encontrado.");
    return;
  }
  renderListingDetail(container, listing);
}

export function mount(container) {
  injectStylesheet();
  const dataClient = createDataClient();

  async function renderCurrentRoute() {
    const route = parseRoute(location.pathname, location.search);
    if (route.name === "home") return renderHomeRoute(container, dataClient);
    if (route.name === "city") return renderCityRoute(container, dataClient, route);
    if (route.name === "listing") return renderListingRoute(container, dataClient, route);
    return renderNotFound(container);
  }

  // Intercepts same-origin link clicks for SPA navigation. Links to a
  // minisite (a different hostname, e.g. https://joao.imobiliarista.net)
  // fall through to a normal full navigation.
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

  renderCurrentRoute();
}
