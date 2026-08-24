// frontend/minisite/render.js
//
// DOM mounting for the minisite (§16-§17), verified visually rather than
// unit-tested (see frontend/portal/render.js for the same convention).
// Reuses the card markup and the imóvel completo view from
// frontend/portal/render.js instead of duplicating them — a listing looks
// the same whether you arrived via the portal or a minisite.

import { renderCard } from "../portal/render.js";
// modules/publications (§47): formatPublicationDate is generated from
// modules/publications/index.js — see frontend/shared/publications.generated.js.
import { formatPublicationDate } from "../shared/publications.generated.js";

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

/** §75 — hostname não corresponde a nenhum corretor publicado. */
export function renderSiteNotFound(container) {
  clear(container);
  container.append(
    el("div", { className: "imob-not-found" }, [
      el("h2", { text: "Minisite não encontrado" }),
      el("p", { text: "Não há nenhum corretor publicado neste endereço." }),
    ]),
  );
}

/** §76 — corretor suspenso: publicação mínima, sem perfil/listings completos. */
export function renderSuspended(container) {
  clear(container);
  container.append(
    el("div", { className: "imob-not-found" }, [
      el("h2", { text: "Indisponível" }),
      el("p", { text: "Este espaço está temporariamente indisponível." }),
    ]),
  );
}

/**
 * Renders the broker's minisite home: profile header + listings grid +
 * "carregar mais" when the broker's listings are sharded (§17).
 *
 * `state`: { profile, cards, hasMore, publications }
 * `handlers`: { onLoadMore }
 */
export function renderProfile(container, state, handlers = {}) {
  clear(container);
  const { profile, cards, hasMore, publications } = state;

  const header = el("header", { className: "imob-broker-header" }, [
    profile.logo ? el("img", { className: "imob-broker-logo", attrs: { src: profile.logo, alt: profile.name } }) : null,
    el("h1", { text: profile.name }),
    profile.creciPublic ? el("p", { className: "imob-message", text: `CRECI ${profile.creciPublic}` }) : null,
    profile.about ? el("p", { className: "imob-broker-about", text: profile.about }) : null,
  ]);

  const children = [header];

  if (!cards || cards.length === 0) {
    children.push(el("p", { className: "imob-message", text: "Nenhum imóvel publicado ainda." }));
  } else {
    children.push(el("div", { className: "imob-card-grid" }, cards.map(renderCard)));
    if (hasMore) {
      const button = el("button", { className: "imob-load-more", text: "Carregar mais" });
      button.addEventListener("click", () => handlers.onLoadMore?.());
      children.push(button);
    }
  }

  // §47 (mesmo espírito de §49 "se inexistente, componente não
  // renderiza"): sem entradas — módulo desabilitado, feed vazio ou busca
  // ao blog externo falhou — o bloco de publicações simplesmente não
  // aparece, nunca uma seção vazia.
  if (publications && publications.length > 0) {
    children.push(renderPublicationsSection(publications));
  }

  container.append(...children);
}

function renderPublicationsSection(entries) {
  const items = entries.map((entry) =>
    el("li", { className: "imob-publication-item" }, [
      el("a", {
        className: "imob-publication-title",
        text: entry.title,
        attrs: { href: entry.url, target: "_blank", rel: "noreferrer" },
      }),
      entry.publishedAt
        ? el("time", { className: "imob-publication-date", text: formatPublicationDate(entry.publishedAt) })
        : null,
      entry.summary ? el("p", { className: "imob-publication-summary", text: entry.summary }) : null,
    ]),
  );

  return el("section", { className: "imob-publications" }, [
    el("h2", { text: "Publicações" }),
    el("ul", { className: "imob-publication-list" }, items),
  ]);
}
