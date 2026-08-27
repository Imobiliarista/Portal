// frontend/minisite/app.js
//
// Mirrors frontend/portal/app.js's shape (data → render, click
// interception for SPA navigation) but scoped to one broker resolved from
// the hostname (§74). Reuses frontend/portal/render.js for the imóvel
// completo page, the card markup, and the data-unavailable error state
// (Etapa 8) — see that file's header comment.
//
// `renderMinisiteRoute` is exported (mirroring frontend/portal/app.js's
// route functions) so tests/frontend/minisite/app.test.js can exercise the
// not-found/suspended/temporarily-unavailable distinction directly,
// without simulating `window`/`history`/`location` — same reasoning as
// portal/app.js's header comment.

import { resolveBrokerSlug, createDataClient, PublicDataNotFoundError } from "./data.js";
import { classifyPublicDataErrorReason } from "../shared/public-data-errors.js";
import { renderLoading, renderSiteNotFound, renderSuspended, renderProfile } from "./render.js";
import { renderListingDetail, renderNotFound, renderDataUnavailable } from "../portal/render.js";
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
// renderMinisiteRoute, antes de chegar na rota de imóvel), então não
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

/**
 * §17 — a listagem de imóveis do corretor tenta o arquivo único primeiro
 * (`listingsFlat`, corretor pequeno) e cai para o manifest+shards
 * (corretor grande) só quando o primeiro não existe. Desde a Etapa 8, um
 * `PublicDataNotFoundError` é exatamente esse "não existe, tente o
 * próximo formato" — qualquer outro erro (rede/CORS/HTTP/contrato) já não
 * pode ser tratado como "tente o próximo formato": é uma falha real, com
 * "Tentar novamente" oferecido ao visitante.
 */
async function renderProfileRoute(container, dataClient, brokerSlug, profile) {
  // Roda em paralelo com os imóveis — um blog externo lento/fora do ar
  // não deveria atrasar a listagem de imóveis, que é o conteúdo
  // principal do minisite.
  const publicationsPromise = loadPublications(profile);

  let flat = null;
  try {
    flat = await dataClient.listingsFlat(brokerSlug);
  } catch (error) {
    if (!(error instanceof PublicDataNotFoundError)) {
      console.error(`Falha ao carregar listings.json do corretor "${brokerSlug}":`, error);
      renderDataUnavailable(container, {
        reason: classifyPublicDataErrorReason(error),
        onRetry: () => renderProfileRoute(container, dataClient, brokerSlug, profile),
      });
      return;
    }
  }
  if (flat) {
    renderProfile(container, { profile, cards: flat, hasMore: false, publications: await publicationsPromise }, {});
    return;
  }

  let manifest = null;
  try {
    manifest = await dataClient.listingsManifest(brokerSlug);
  } catch (error) {
    if (!(error instanceof PublicDataNotFoundError)) {
      console.error(`Falha ao carregar manifest de listings do corretor "${brokerSlug}":`, error);
      renderDataUnavailable(container, {
        reason: classifyPublicDataErrorReason(error),
        onRetry: () => renderProfileRoute(container, dataClient, brokerSlug, profile),
      });
      return;
    }
  }
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
    const shardNumber = cursor + 1;
    try {
      const shardCards = await dataClient.listingsShard(brokerSlug, shardNumber);
      cursor += 1;
      cards = [...cards, ...shardCards];
      renderProfile(container, { profile, cards, hasMore: cursor < shardCount, publications }, { onLoadMore: loadNextShard });
    } catch (error) {
      if (error instanceof PublicDataNotFoundError) {
        cursor += 1;
        renderProfile(container, { profile, cards, hasMore: cursor < shardCount, publications }, { onLoadMore: loadNextShard });
        return;
      }
      console.error(`Falha ao carregar shard ${shardNumber} de listings do corretor "${brokerSlug}":`, error);
      renderDataUnavailable(container, { reason: classifyPublicDataErrorReason(error), onRetry: loadNextShard });
    }
  }
  await loadNextShard();
}

/**
 * Ponto único de decisão de rota do minisite (perfil vs. imóvel), incluindo
 * a distinção de 3 estados que a Etapa 8 pede explicitamente (§75/§76):
 *
 *   - corretor não existe/não publicado (404 no profile)  -> "não encontrado"
 *   - corretor existe mas está suspenso (profile.status)  -> "indisponível" (§76)
 *   - profile existe mas o fetch falhou por rede/CORS/HTTP/contrato -> NUNCA
 *     vira "não encontrado" — é "dados temporariamente indisponíveis",
 *     com retry.
 */
export async function renderMinisiteRoute(container, dataClient, brokerSlug, pathname) {
  renderLoading(container);

  let profile;
  try {
    profile = await dataClient.profile(brokerSlug);
  } catch (error) {
    if (error instanceof PublicDataNotFoundError) {
      renderSiteNotFound(container); // §75 — corretor não existe/não publicado
      return;
    }
    console.error(`Falha ao carregar perfil do corretor "${brokerSlug}":`, error);
    renderDataUnavailable(container, {
      reason: classifyPublicDataErrorReason(error),
      onRetry: () => renderMinisiteRoute(container, dataClient, brokerSlug, pathname),
    });
    return;
  }

  if (profile.status !== "active") {
    renderSuspended(container); // §76
    return;
  }

  const listingMatch = pathname.match(/^\/imovel\/([^/]+)\/?$/);
  if (listingMatch) {
    let listing;
    try {
      listing = await dataClient.listing(decodeURIComponent(listingMatch[1]));
    } catch (error) {
      if (error instanceof PublicDataNotFoundError) {
        renderNotFound(container, "Imóvel não encontrado.");
        return;
      }
      console.error("Falha ao carregar imóvel:", error);
      renderDataUnavailable(container, {
        reason: classifyPublicDataErrorReason(error),
        onRetry: () => renderMinisiteRoute(container, dataClient, brokerSlug, pathname),
      });
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

  try {
    await renderProfileRoute(container, dataClient, brokerSlug, profile);
  } catch (error) {
    // Rede de segurança final (mesmo espírito de frontend/portal/app.js)
    // — renderProfileRoute já trata os 4 erros tipados internamente; isto
    // só existe para um bug inesperado não travar em "Carregando…".
    console.error("Erro inesperado ao renderizar minisite:", error);
    renderDataUnavailable(container, {
      reason: "network",
      onRetry: () => renderMinisiteRoute(container, dataClient, brokerSlug, pathname),
    });
  }
}

export async function mount(container) {
  injectStylesheet();

  const brokerSlug = resolveBrokerSlug();
  if (!brokerSlug) {
    renderSiteNotFound(container); // §75 — hostname não é um minisite válido
    return;
  }

  const dataClient = createDataClient();

  const renderCurrentRoute = () => renderMinisiteRoute(container, dataClient, brokerSlug, location.pathname);

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
