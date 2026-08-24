// frontend/shared/tour-360.generated.js
//
// GERADO por scripts/generate-tour-360-assets.js a partir de
// modules/tour-360/index.js — não editar à mão (§49, módulo tour-360).
// Regenerar com: npm run generate:tour-360

export function buildTour360LinkProps(tour360) {
  if (!tour360 || typeof tour360.url !== "string" || !tour360.url) return null;
  return {
    href: tour360.url,
    text: "Ver tour 360°",
    target: "_blank",
    rel: "noreferrer",
  };
}
