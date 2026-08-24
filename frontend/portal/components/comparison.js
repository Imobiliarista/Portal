// frontend/portal/components/comparison.js
//
// DOM layer of the comparison module (§45) — portal-only UI: the "add to
// comparison" toggle on a card/imóvel, the persistent selection bar, and
// the /comparar side-by-side grid. Pure logic (localStorage read/write,
// which fields make the grid) lives in modules/comparison/index.js and
// reaches the browser as frontend/shared/comparison.generated.js — same
// split as ../render.js (view-model vs DOM mounting) and every other
// Etapa 9 module (tour-360, video-youtube, publications).
//
// Deliberately scoped to frontend/portal/: ../render.js's `renderCard` and
// `renderListingDetail` are reused as-is by the minisite
// (frontend/minisite/), so this file never edits their output — it wraps/
// decorates the DOM nodes they return, from the portal's own app.js, after
// the fact. That keeps the minisite (which has no comparison feature)
// pixel-identical to before this module existed.
//
// Not unit-tested, same convention as the DOM-mounting half of
// ../render.js (see its header comment) — verified visually per §90 Etapa
// 2's "start the dev server and use the feature in a browser".

import {
  MAX_COMPARISON_ITEMS,
  readComparisonSlugs,
  writeComparisonSlugs,
  clearComparisonSlugs,
  isInComparison,
  toggleComparisonSlug,
  buildComparisonRows,
} from "../../shared/comparison.generated.js";
import { formatPrice, formatArea, formatPurpose } from "../render.js";
import { buildListingUrl } from "../router.js";

function el(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) if (child) node.append(child);
  return node;
}

function setToggleState(button, active) {
  button.textContent = active ? "✓ Na comparação" : "+ Comparar";
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
}

/**
 * Builds a self-contained toggle button for one listing `slug`. Reflects
 * the current selection state on mount and after every click; calls
 * `onChange(result)` (the `toggleComparisonSlug` result) so callers can
 * refresh the bar/other toggles. Refusing to add past
 * `MAX_COMPARISON_ITEMS` (`result.atLimit`) surfaces as a plain `alert` —
 * a one-off edge case not worth a custom toast component in a
 * framework-free SPA (§94).
 */
export function createCompareToggleButton(slug, { onChange } = {}) {
  const button = el("button", { className: "imob-compare-toggle", attrs: { type: "button" } });
  setToggleState(button, isInComparison(readComparisonSlugs(), slug));
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const result = toggleComparisonSlug(slug);
    setToggleState(button, isInComparison(result.slugs, slug));
    if (result.atLimit) {
      alert(`Você já selecionou ${MAX_COMPARISON_ITEMS} imóveis para comparar. Remova um para adicionar outro.`);
    }
    onChange?.(result);
  });
  return button;
}

/**
 * Decorates the cards a portal city-view grid just rendered (§13/§45
 * "adicionar à comparação a partir do card"): wraps each `.imob-card`
 * anchor `renderCard` produced in a `<div>` and appends a toggle button as
 * a sibling — never nests the button inside the `<a>` (invalid HTML,
 * would fire both the navigation and the toggle on one click). `cards`
 * must be in the same order the grid was rendered in (frontend/portal's
 * `renderCityView` calls `cards.map(renderCard)`, so DOM order already
 * matches array order).
 */
export function attachCompareToggles(container, cards, { onChange } = {}) {
  const cardNodes = container.querySelectorAll(".imob-card");
  cardNodes.forEach((anchor, index) => {
    const card = cards[index];
    if (!card?.slug) return;
    const wrapper = el("div", { className: "imob-card-cell" });
    anchor.replaceWith(wrapper);
    wrapper.append(anchor, createCompareToggleButton(card.slug, { onChange }));
  });
}

/**
 * The persistent selection bar (§45 — "1 imóvel selecionado · Comparar ·
 * Limpar"), mounted once outside the router-controlled container so it
 * survives route changes. Hidden entirely when the selection is empty.
 * `onNavigate(path)`/`onClear()` are supplied by app.js, which owns
 * `history`/routing — this component never touches `location`/`history`
 * directly.
 */
export function createCompareBar({ onNavigate, onClear } = {}) {
  const countLabel = el("span", { className: "imob-compare-bar__count" });
  const compareButton = el("button", { className: "imob-compare-bar__action", text: "Comparar", attrs: { type: "button" } });
  const clearButton = el("button", { className: "imob-compare-bar__clear", text: "Limpar", attrs: { type: "button" } });
  const element = el("div", { className: "imob-compare-bar" }, [countLabel, compareButton, clearButton]);

  compareButton.addEventListener("click", () => onNavigate?.());
  clearButton.addEventListener("click", () => {
    clearComparisonSlugs();
    onClear?.();
    refresh();
  });

  function refresh() {
    const count = readComparisonSlugs().length;
    element.hidden = count === 0;
    countLabel.textContent = count === 1 ? "1 imóvel selecionado" : `${count} imóveis selecionados`;
  }

  refresh();
  return { element, refresh };
}

function formatRowValue(key, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "price" || key === "condominium" || key === "iptu") return formatPrice(value);
  if (key === "area") return formatArea(value);
  if (key === "purpose") return formatPurpose(value);
  return String(value);
}

/**
 * Renders the /comparar side-by-side grid (§45): one column per selected
 * imóvel completo (listing-public.schema.json, §15), one row per compared
 * field (`buildComparisonRows`). `onRemove(slug)` is called from a
 * per-column "Remover" button, wired by app.js to re-render the route.
 */
export function renderComparisonView(container, listings, { onRemove } = {}) {
  container.replaceChildren();

  const headRow = el("tr", {}, [
    el("th", { className: "imob-comparison-table__field-header", text: "Imóvel" }),
    ...listings.map((listing) =>
      el("th", {}, [
        el("a", { attrs: { href: buildListingUrl(listing.slug) }, text: listing.title ?? listing.slug }),
        el("button", {
          className: "imob-comparison-table__remove",
          text: "Remover",
          attrs: { type: "button" },
        }),
      ]),
    ),
  ]);

  // Click handlers wired after the fact (once each <th>/button exists)
  // instead of threading a listener through el()'s plain-attrs API.
  const removeButtons = headRow.querySelectorAll(".imob-comparison-table__remove");
  removeButtons.forEach((button, index) => {
    button.addEventListener("click", () => onRemove?.(listings[index].slug));
  });

  const rows = buildComparisonRows(listings).map((row) =>
    el("tr", {}, [
      el("th", { className: "imob-comparison-table__field-header", text: row.label }),
      ...row.values.map((value) => el("td", { text: formatRowValue(row.key, value) })),
    ]),
  );

  const table = el("table", { className: "imob-comparison-table" }, [
    el("thead", {}, [headRow]),
    el("tbody", {}, rows),
  ]);

  container.append(el("h1", { text: "Comparar imóveis" }), table);
}
