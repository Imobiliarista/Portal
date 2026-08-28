// frontend/portal/app.js
//
// Wires router + data + filters + render together and owns the only
// impure bits (history, DOM events). Everything it calls into
// (router.js, data.js, filters.js, the view-model builders in render.js)
// is pure and independently unit-tested; this file is verified visually
// (§90 Etapa 2 — "start the dev server and use the feature in a browser")
// PLUS, since Etapa 8 (missão "encerra o carregamento infinito"), the
// route functions below are exported and unit-tested directly
// (tests/frontend/portal/app.test.js, with a minimal fake DOM —
// tests/support/fake-dom.js) against a fake `dataClient` that throws each
// of the 4 typed errors from ../shared/public-data-errors.js — proving
// none of them can leave `renderLoading()` as the last thing on screen.

import { parseRoute, buildComparisonUrl } from "./router.js";
import { createDataClient, PublicDataNotFoundError } from "./data.js";
import { classifyPublicDataErrorReason } from "../shared/public-data-errors.js";
import { filterCards, sortCards, shardsNeededForFilters } from "./filters.js";
import {
  renderLoading,
  renderMessage,
  renderNotFound,
  renderEmptyCity,
  renderHome,
  renderCityView,
  renderListingDetail,
  renderDataUnavailable,
} from "./render.js";
// Módulo comparison (§45): seleção fica em localStorage (frontend/shared/
// comparison.generated.js), UI portal-only em ./components/comparison.js —
// ver o header desse arquivo para o porquê de não tocar render.js.
import { readComparisonSlugs, writeComparisonSlugs } from "../shared/comparison.generated.js";
import { createCompareBar, attachCompareToggles, createCompareToggleButton, renderComparisonView } from "./components/comparison.js";
// Módulo financing-calculator (§44): lógica pura em frontend/shared/
// financing-calculator.generated.js, UI em ./components/financing-calculator.js
// — mesmo motivo de não tocar render.js documentado no header desse arquivo.
import { mountFinancingCalculator } from "./components/financing-calculator.js";
// Módulo appointments (§41): lógica pura em frontend/shared/
// appointments.generated.js, UI em ./components/appointments.js — mesmo
// motivo de não tocar render.js documentado no header desse arquivo.
import { mountAppointmentForm } from "./components/appointments.js";

function injectStylesheet() {
  if (document.querySelector('link[data-imob-portal-styles]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/portal/styles/main.css"; // absolute — see frontend/index.html's comment on modulePath
  link.dataset.imobPortalStyles = "true";
  document.head.append(link);
}

/**
 * Constrói o par ({reason, onRetry}) que toda rota abaixo passa para
 * `renderDataUnavailable` num catch — centraliza o log técnico (console,
 * nunca a tela — Etapa 8 "registrar erro técnico seguro no console") e a
 * classificação do erro numa única função, para as 4 rotas nunca
 * divergirem em como tratam a mesma família de erro.
 */
function reportDataUnavailable(container, error, label, onRetry) {
  console.error(`${label}:`, error);
  renderDataUnavailable(container, { reason: classifyPublicDataErrorReason(error), onRetry });
}

export async function renderHomeRoute(container, dataClient) {
  renderLoading(container);
  try {
    const data = await dataClient.portalCities();
    renderHome(container, { cities: data?.cities ?? [] });
  } catch (error) {
    // portal/cities.json é publicado incondicionalmente desde a Etapa 3
    // (business/publishing.js#publishPortalCatalogs — mesmo com
    // IMOB_PRIVATE vazio, o objeto existe com `cities: []`), então
    // qualquer falha aqui — 404 incluso — é inesperada, nunca "cidade não
    // encontrada": não há um caso legítimo de ausência para distinguir.
    reportDataUnavailable(container, error, "Falha ao carregar portal/cities.json", () =>
      renderHomeRoute(container, dataClient),
    );
  }
}

export async function renderCityRoute(container, dataClient, route, compareBar) {
  renderLoading(container);
  const { citySlug, filters, sortBy } = route;

  let manifest;
  try {
    manifest = await dataClient.cityManifest(citySlug);
  } catch (error) {
    if (error instanceof PublicDataNotFoundError) {
      renderNotFound(container, `Cidade "${citySlug}" não encontrada.`);
      return;
    }
    reportDataUnavailable(container, error, `Falha ao carregar manifest da cidade "${citySlug}"`, () =>
      renderCityRoute(container, dataClient, route, compareBar),
    );
    return;
  }

  if (!manifest.shards || manifest.shards.length === 0) {
    renderEmptyCity(container, citySlug); // §77
    return;
  }

  // §21-22: use the compact index (when published) to fetch only the
  // shards that can contain a match, instead of the whole city. A 404 here
  // is optional-resource-not-published-yet (falls back to "every shard"),
  // never a hard failure; any other error still needs to stop and offer
  // retry, same as every other fetch in this route.
  let index = null;
  try {
    index = await dataClient.cityIndex(citySlug);
  } catch (error) {
    if (!(error instanceof PublicDataNotFoundError)) {
      reportDataUnavailable(container, error, `Falha ao carregar índice da cidade "${citySlug}"`, () =>
        renderCityRoute(container, dataClient, route, compareBar),
      );
      return;
    }
  }
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
    try {
      const shardCards = await dataClient.cityShard(citySlug, shardNumber);
      cursor += 1;
      cards = sortCards([...cards, ...filterCards(shardCards, filters)], sortBy);
      paint(cursor < shardPlan.length);
    } catch (error) {
      if (error instanceof PublicDataNotFoundError) {
        // Shard ausente inesperadamente (o índice/manifest apontava para
        // ele) — trata como vazio e segue em frente em vez de travar toda
        // a paginação por um único shard ausente.
        cursor += 1;
        paint(cursor < shardPlan.length);
        return;
      }
      reportDataUnavailable(container, error, `Falha ao carregar shard ${shardNumber} da cidade "${citySlug}"`, loadNextShard);
    }
  }

  if (shardPlan.length === 0) {
    paint(false);
    return;
  }

  await loadNextShard();
}

export async function renderListingRoute(container, dataClient, route, compareBar) {
  renderLoading(container);

  let listing;
  try {
    listing = await dataClient.listing(route.slug);
  } catch (error) {
    if (error instanceof PublicDataNotFoundError) {
      renderNotFound(container, "Imóvel não encontrado.");
      return;
    }
    reportDataUnavailable(container, error, `Falha ao carregar imóvel "${route.slug}"`, () =>
      renderListingRoute(container, dataClient, route, compareBar),
    );
    return;
  }

  renderListingDetail(container, listing);
  // §45 — appended after the fact so ../render.js#renderListingDetail (also
  // used by the minisite) stays untouched; see components/comparison.js header.
  container.prepend(createCompareToggleButton(listing.slug, { onChange: () => compareBar.refresh() }));
  // §44 — same reasoning: appended after the fact, see components/financing-calculator.js header.
  mountFinancingCalculator(container, { propertyValue: listing.price });
  // §41 — appended after the fact, same reasoning. listing.broker (§15) só
  // tem slug/name, não whatsapp (§16), então busca o perfil público à
  // parte — não renderiza nada se o corretor não tiver WhatsApp válido.
  if (listing.broker?.slug) {
    let brokerProfile = null;
    try {
      brokerProfile = await dataClient.brokerProfile(listing.broker.slug);
    } catch (error) {
      // Dado auxiliar (só usado pro WhatsApp do formulário de agendamento)
      // — uma falha aqui não pode derrubar a página do imóvel, que já
      // renderizou com sucesso. Loga e segue sem WhatsApp, mesmo espírito
      // de "campo opcional, se indisponível o componente não aparece"
      // já usado por outros módulos (ex.: publications no minisite).
      console.error(`Falha ao carregar perfil do corretor "${listing.broker.slug}" (não crítico):`, error);
    }
    mountAppointmentForm(container, { listing, brokerWhatsapp: brokerProfile?.whatsapp });
  }
}

export async function renderComparisonRoute(container, dataClient, compareBar) {
  renderLoading(container);
  const slugs = readComparisonSlugs();
  if (slugs.length === 0) {
    renderMessage(container, "Nenhum imóvel selecionado para comparar. Use o botão \"+ Comparar\" num card ou na página de um imóvel.");
    return;
  }

  const settled = await Promise.allSettled(slugs.map((slug) => dataClient.listing(slug)));
  const listings = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      listings.push(result.value);
      continue;
    }
    if (result.reason instanceof PublicDataNotFoundError) {
      // §77 — um imóvel selecionado saiu do ar entre a seleção e esta
      // visita; tratado abaixo junto com a remoção do slug órfão, mesma
      // lógica original.
      continue;
    }
    reportDataUnavailable(container, result.reason, "Falha ao carregar imóveis para comparação", () =>
      renderComparisonRoute(container, dataClient, compareBar),
    );
    return;
  }

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
    try {
      if (route.name === "home") await renderHomeRoute(container, dataClient);
      else if (route.name === "city") await renderCityRoute(container, dataClient, route, compareBar);
      else if (route.name === "listing") await renderListingRoute(container, dataClient, route, compareBar);
      else if (route.name === "comparison") await renderComparisonRoute(container, dataClient, compareBar);
      else renderNotFound(container);
    } catch (error) {
      // Rede de segurança final (Etapa 8: "nenhum caminho iniciado por
      // mount() pode deixar renderLoading() permanentemente ativo") — cada
      // rota acima já trata os 4 erros tipados de
      // ../shared/public-data-errors.js internamente; isto só existe para
      // um bug realmente inesperado não travar a tela em "Carregando…".
      console.error("Erro inesperado ao renderizar rota:", error);
      renderDataUnavailable(container, { reason: "network", onRetry: () => renderCurrentRoute() });
    }
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
