// frontend/portal/app.js
//
// Wires router + data + filters + render together and owns the only
// impure bits (history, DOM events). Everything it calls into
// (router.js, data.js, filters.js, the view-model builders in render.js)
// is pure and independently unit-tested; this file is verified visually
// (§90 Etapa 2 — "start the dev server and use the feature in a browser").

import { parseRoute, buildComparisonUrl } from "./router.js";
import { createDataClient } from "./data.js";
import { filterCards, sortCards, shardsNeededForFilters } from "./filters.js";
import {
  renderLoading,
  renderMessage,
  renderNotFound,
  renderEmptyCity,
  renderHome,
  renderCityView,
  renderListingDetail,
} from "./render.js";
// Módulo comparison (§45): seleção fica em localStorage (frontend/shared/
// comparison.generated.js), UI portal-only em ./components/comparison.js —
// ver o header desse arquivo para o porquê de não tocar render.js.
import { readComparisonSlugs, writeComparisonSlugs } from "../shared/comparison.generated.js";
import { createCompareBar, attachCompareToggles, createCompareToggleButton, renderComparisonView } from "./components/comparison.js";

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

async function renderCityRoute(container, dataClient, route, compareBar) {
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

  // §45 — every (re)paint of the grid gets its "adicionar à comparação"
  // toggles reattached (renderCityView clears+rebuilds the whole grid on
  // every "carregar mais", so the toggles from the previous paint are gone).
  function paint(hasMore) {
    renderCityView(container, { manifest, citySlug, cards, hasMore }, { onLoadMore: loadNextShard });
    attachCompareToggles(container, cards, { onChange: () => compareBar.refresh() });
  }

  async function loadNextShard() {
    if (cursor >= shardPlan.length) return;
    const shardNumber = shardPlan[cursor];
    cursor += 1;
    const shardCards = (await dataClient.cityShard(citySlug, shardNumber)) ?? [];
    cards = sortCards([...cards, ...filterCards(shardCards, filters)], sortBy);
    paint(cursor < shardPlan.length);
  }

  if (shardPlan.length === 0) {
    paint(false);
    return;
  }

  await loadNextShard();
}

async function renderListingRoute(container, dataClient, route, compareBar) {
  renderLoading(container);
  const listing = await dataClient.listing(route.slug);
  if (!listing) {
    renderNotFound(container, "Imóvel não encontrado.");
    return;
  }
  renderListingDetail(container, listing);
  // §45 — appended after the fact so ../render.js#renderListingDetail (also
  // used by the minisite) stays untouched; see components/comparison.js header.
  container.prepend(createCompareToggleButton(listing.slug, { onChange: () => compareBar.refresh() }));
}

async function renderComparisonRoute(container, dataClient, compareBar) {
  renderLoading(container);
  const slugs = readComparisonSlugs();
  if (slugs.length === 0) {
    renderMessage(container, "Nenhum imóvel selecionado para comparar. Use o botão \"+ Comparar\" num card ou na página de um imóvel.");
    return;
  }

  const listings = (await Promise.all(slugs.map((slug) => dataClient.listing(slug)))).filter(Boolean);
  if (listings.length !== slugs.length) {
    // Um imóvel selecionado pode ter saído do ar (§77) entre a seleção e
    // esta visita — remove o(s) slug(s) órfão(s) para a barra não contar
    // imóvel que não existe mais.
    writeComparisonSlugs(listings.map((listing) => listing.slug));
    compareBar.refresh();
  }

  if (listings.length === 0) {
    renderMessage(container, "Os imóveis selecionados não estão mais disponíveis.");
    return;
  }

  renderComparisonView(container, listings, {
    onRemove: (slug) => {
      writeComparisonSlugs(listings.filter((listing) => listing.slug !== slug).map((listing) => listing.slug));
      compareBar.refresh();
      renderComparisonRoute(container, dataClient, compareBar);
    },
  });
}

export function mount(container) {
  injectStylesheet();
  const dataClient = createDataClient();

  // §45 — mounted once outside `container` (the router clears/rebuilds it
  // on every navigation) so the selection bar survives route changes.
  const compareBar = createCompareBar({
    onNavigate: () => navigateTo(buildComparisonUrl()),
    onClear: () => {
      if (parseRoute(location.pathname, location.search).name === "comparison") renderCurrentRoute();
    },
  });
  (container.parentElement ?? document.body).append(compareBar.element);

  function navigateTo(path) {
    history.pushState({}, "", path);
    renderCurrentRoute();
  }

  async function renderCurrentRoute() {
    const route = parseRoute(location.pathname, location.search);
    if (route.name === "home") await renderHomeRoute(container, dataClient);
    else if (route.name === "city") await renderCityRoute(container, dataClient, route, compareBar);
    else if (route.name === "listing") await renderListingRoute(container, dataClient, route, compareBar);
    else if (route.name === "comparison") await renderComparisonRoute(container, dataClient, compareBar);
    else renderNotFound(container);
    compareBar.refresh();
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
