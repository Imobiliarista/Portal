// frontend/minisite/app.js
//
// Mirrors frontend/portal/app.js's shape (data → render, click
// interception for SPA navigation) but scoped to one broker resolved from
// the hostname (§74). Reuses frontend/portal/render.js for the imóvel
// completo page and the card markup — see that file's header comment.

import { resolveBrokerSlug, createDataClient } from "./data.js";
import { renderLoading, renderSiteNotFound, renderSuspended, renderProfile } from "./render.js";
import { renderListingDetail, renderNotFound } from "../portal/render.js";
// modules/publications (§47): gerado a partir de
// modules/publications/index.js + config.js — ver
// frontend/shared/publications.generated.js. Consumo 100% client-side,
// sem rota de Worker (mesma filosofia de video-youtube/tour-360).
import { readPublicationsConfig, parseAtomFeed } from "../shared/publications.generated.js";
// modules/financing-calculator (§44): mesmo componente reaproveitado do
// portal — a página de imóvel completo é idêntica nos dois sites (ver
// header de ../portal/render.js) e o comprador de um minisite também se
// beneficia da simulação. Ver frontend/portal/components/financing-calculator.js.
import { mountFinancingCalculator } from "../portal/components/financing-calculator.js";
// modules/appointments (§41): mesmo componente reaproveitado do portal —
// ver frontend/portal/components/appointments.js. Diferente do portal, o
// minisite já tem `profile.whatsapp` em mãos (buscado abaixo, em
// renderCurrentRoute, antes de chegar na rota de imóvel), então não
// precisa de um fetch extra.
import { mountAppointmentForm } from "../portal/components/appointments.js";

function injectStylesheet() {
  if (document.querySelector("link[data-imob-minisite-styles]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/minisite/styles/main.css"; // absolute — see frontend/index.html's comment on modulePath
  link.dataset.imobMinisiteStyles = "true";
  document.head.append(link);
}

// modules/publications (§47): busca e faz o parsing do feed já resolvido
// (broker.modules.publications.feedUrl — descoberta aconteceu uma vez no
// painel, ver modules/publications/README.md#decisões). Nunca lança:
// blog fora do ar/CORS bloqueado/feed mudou de formato viram `[]`
// silenciosamente — mesmo espírito de "campo opcional, se inexistente
// componente não renderiza" dos módulos tour-360/video-youtube.
async function loadPublications(profile) {
  const config = readPublicationsConfig(profile);
  if (!config.enabled) return [];
  try {
    const response = await fetch(config.feedUrl);
    if (!response.ok) return [];
    return parseAtomFeed(await response.text());
  } catch {
    return [];
  }
}

async function renderProfileRoute(container, dataClient, brokerSlug, profile) {
  // Roda em paralelo com os imóveis — um blog externo lento/fora do ar
  // não deveria atrasar a listagem de imóveis, que é o conteúdo
  // principal do minisite.
  const publicationsPromise = loadPublications(profile);

  const flat = await dataClient.listingsFlat(brokerSlug);
  if (flat) {
    renderProfile(container, { profile, cards: flat, hasMore: false, publications: await publicationsPromise }, {});
    return;
  }

  // §17 — broker cresceu além do arquivo único: mesma partição por shard da cidade.
  const manifest = await dataClient.listingsManifest(brokerSlug);
  const shardCount = manifest?.shards?.length ?? 0;
  if (shardCount === 0) {
    renderProfile(container, { profile, cards: [], hasMore: false, publications: await publicationsPromise }, {});
    return;
  }

  const publications = await publicationsPromise;
  let cards = [];
  let cursor = 0;
  async function loadNextShard() {
    if (cursor >= shardCount) return;
    cursor += 1;
    const shardCards = (await dataClient.listingsShard(brokerSlug, cursor)) ?? [];
    cards = [...cards, ...shardCards];
    renderProfile(container, { profile, cards, hasMore: cursor < shardCount, publications }, { onLoadMore: loadNextShard });
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
      // §44 — appended after the fact, same reasoning as the portal's app.js.
      mountFinancingCalculator(container, { propertyValue: listing.price });
      // §41 — appended after the fact, same reasoning. `profile` here is
      // this minisite's own broker (§74), already resolved above.
      mountAppointmentForm(container, { listing, brokerWhatsapp: profile.whatsapp });
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
