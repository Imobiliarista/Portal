// frontend/portal/render.js
//
// View-model builders (pure, unit-tested) + DOM mounting (plain DOM APIs,
// no framework — verified visually per §90 Etapa 2, not unit-tested).
// `renderListingDetail` is also imported by frontend/minisite/app.js: the
// imóvel completo page (§15) is identical regardless of which site the
// visitor arrived from, so the minisite reuses it instead of duplicating
// the markup.

import { buildListingUrl } from "./router.js";
import { buildEmbedUrl } from "../shared/video-youtube.generated.js";
import { buildTour360LinkProps } from "../shared/tour-360.generated.js";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function formatPrice(value) {
  return typeof value === "number" ? currencyFormatter.format(value) : "—";
}

export function formatArea(value) {
  return typeof value === "number" ? `${value} m²` : "—";
}

const PURPOSE_LABELS = { venda: "Venda", aluguel: "Aluguel" };
export function formatPurpose(purpose) {
  return PURPOSE_LABELS[purpose] ?? purpose;
}

const STATUS_MESSAGES = {
  inactive: "Este anúncio está temporariamente inativo.",
  suspended: "Este anúncio não está disponível no momento.",
  sold: "Este imóvel já foi vendido.",
  removed: "Este anúncio foi removido.",
};

/** Builds the view-model for one card (city-shard.schema.json entry). */
export function cardViewModel(card) {
  return {
    id: card.id,
    slug: card.slug,
    href: buildListingUrl(card.slug),
    title: card.title,
    priceLabel: formatPrice(card.price),
    purposeLabel: formatPurpose(card.purpose),
    type: card.type,
    district: card.district,
    bedrooms: card.bedrooms,
    bathrooms: card.bathrooms,
    parkingSpaces: card.parkingSpaces,
    areaLabel: formatArea(card.area),
    cover: card.cover ?? null,
    featured: Boolean(card.featured),
  };
}

/** Builds the view-model for the imóvel completo page (listing-public.schema.json). */
export function listingViewModel(listing) {
  return {
    slug: listing.slug,
    title: listing.title,
    description: listing.description,
    priceLabel: formatPrice(listing.price),
    purposeLabel: formatPurpose(listing.purpose),
    type: listing.type,
    condominiumLabel: listing.condominium != null ? formatPrice(listing.condominium) : null,
    iptuLabel: listing.iptu != null ? formatPrice(listing.iptu) : null,
    city: listing.location?.city ?? null,
    district: listing.location?.district ?? null,
    bedrooms: listing.features?.bedrooms ?? null,
    bathrooms: listing.features?.bathrooms ?? null,
    parkingSpaces: listing.features?.parkingSpaces ?? null,
    areaLabel: formatArea(listing.features?.area),
    gallery: listing.gallery ?? [],
    video: listing.video ?? null,
    tour360: listing.tour360 ?? null,
    brokerSlug: listing.broker?.slug ?? null,
    brokerName: listing.broker?.name ?? null,
    unavailableMessage: STATUS_MESSAGES[listing.status] ?? null,
  };
}

function el(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
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

export function renderMessage(container, message) {
  clear(container);
  container.append(el("p", { className: "imob-message", text: message }));
}

/** Exported so frontend/minisite/render.js can reuse the same card markup for a broker's listings. */
export function renderCard(card) {
  const vm = cardViewModel(card);
  const link = el("a", { className: "imob-card", attrs: { href: vm.href } });
  if (vm.cover) {
    link.append(el("img", { className: "imob-card__cover", attrs: { src: vm.cover, alt: vm.title, loading: "lazy" } }));
  }
  link.append(
    el("h3", { className: "imob-card__title", text: vm.title }),
    el("p", { className: "imob-card__price", text: vm.priceLabel }),
    el("p", { className: "imob-card__meta", text: `${vm.purposeLabel} · ${vm.district}` }),
    el("p", { className: "imob-card__meta", text: `${vm.bedrooms} qts · ${vm.bathrooms} banh · ${vm.parkingSpaces} vagas · ${vm.areaLabel}` }),
  );
  return link;
}

/** §77 — cidade sem anúncios. */
export function renderEmptyCity(container, citySlug) {
  clear(container);
  container.append(
    el("div", { className: "imob-empty" }, [
      el("h2", { text: "Nenhum imóvel encontrado" }),
      el("p", { text: `Ainda não há anúncios publicados em "${citySlug}".` }),
    ]),
  );
}

export function renderNotFound(container, message = "Página não encontrada.") {
  clear(container);
  container.append(el("div", { className: "imob-not-found" }, [el("h2", { text: "404" }), el("p", { text: message })]));
}

/**
 * Renders the home view: a list of cities from portal/cities.json (§66).
 * `cities` items: { slug, name, uf, totalListings? }.
 */
export function renderHome(container, { cities }) {
  clear(container);
  if (!cities || cities.length === 0) {
    container.append(el("p", { className: "imob-message", text: "Nenhuma cidade publicada ainda." }));
    return;
  }
  const list = el("ul", { className: "imob-city-list" });
  for (const city of cities) {
    list.append(
      el("li", {}, [
        el("a", { attrs: { href: `/${city.slug}` }, text: `${city.name}${city.uf ? ` - ${city.uf}` : ""}` }),
      ]),
    );
  }
  container.append(el("h1", { text: "imobiliarista.net" }), list);
}

/**
 * Renders the city view: manifest header + currently-loaded cards + a
 * "carregar mais" control when more shards remain (§19 scroll/paginação).
 *
 * `state`: { manifest, cityName, cards, hasMore }
 * `handlers`: { onLoadMore }
 */
export function renderCityView(container, state, handlers = {}) {
  clear(container);
  const { manifest, cards, hasMore } = state;

  const header = el("header", { className: "imob-city-header" }, [
    el("h1", { text: manifest.city?.name ?? state.citySlug }),
    el("p", { className: "imob-message", text: `${cards.length} de ${manifest.totalListings} imóveis` }),
  ]);

  const children = [header];

  if (cards.length === 0 && !hasMore) {
    children.push(el("p", { className: "imob-message", text: "Nenhum imóvel encontrado com esses filtros." }));
  } else {
    children.push(el("div", { className: "imob-card-grid" }, cards.map(renderCard)));
  }

  if (hasMore) {
    const button = el("button", { className: "imob-load-more", text: "Carregar mais" });
    button.addEventListener("click", () => handlers.onLoadMore?.());
    children.push(button);
  }

  container.append(...children);
}

/** Imóvel completo (§15) — shared between portal and minisite. */
export function renderListingDetail(container, listing) {
  clear(container);
  const vm = listingViewModel(listing);

  const children = [el("h1", { text: vm.title })];

  if (vm.unavailableMessage) {
    children.push(el("p", { className: "imob-unavailable", text: vm.unavailableMessage }));
  }

  children.push(
    el("p", { className: "imob-price", text: vm.priceLabel }),
    el("p", { className: "imob-message", text: `${vm.purposeLabel} · ${vm.type} · ${vm.district}, ${vm.city}` }),
    el("p", { className: "imob-message", text: `${vm.bedrooms} qts · ${vm.bathrooms} banh · ${vm.parkingSpaces} vagas · ${vm.areaLabel}` }),
  );

  if (vm.condominiumLabel) children.push(el("p", { text: `Condomínio: ${vm.condominiumLabel}` }));
  if (vm.iptuLabel) children.push(el("p", { text: `IPTU: ${vm.iptuLabel}` }));
  if (vm.description) children.push(el("p", { className: "imob-description", text: vm.description }));

  if (vm.gallery.length > 0) {
    const gallery = el(
      "div",
      { className: "imob-gallery" },
      vm.gallery.map((src) => el("img", { attrs: { src, alt: vm.title, loading: "lazy" } })),
    );
    children.push(gallery);
  }

  if (vm.video?.provider === "youtube" && vm.video.id) {
    children.push(
      el("iframe", {
        className: "imob-video",
        attrs: {
          src: buildEmbedUrl(vm.video.id),
          title: "Vídeo do imóvel",
          allowfullscreen: "true",
        },
      }),
    );
  }

  const tour360Link = buildTour360LinkProps(vm.tour360);
  if (tour360Link) {
    children.push(
      el("a", {
        className: "imob-tour360",
        attrs: { href: tour360Link.href, target: tour360Link.target, rel: tour360Link.rel },
        text: tour360Link.text,
      }),
    );
  }

  if (vm.brokerName) {
    const brokerLink = el("a", {
      text: `Anunciado por ${vm.brokerName}`,
      attrs: vm.brokerSlug ? { href: `https://${vm.brokerSlug}.imobiliarista.net` } : {},
    });
    children.push(el("p", { className: "imob-broker" }, [brokerLink]));
  }

  container.append(...children);
}
