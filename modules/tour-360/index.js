// modules/tour-360/index.js
//
// Módulo tour-360 (§49) — ponto de entrada. Ver README.md desta pasta
// para a decisão completa: diferente de video-youtube (§50), este
// módulo não exporta nenhuma função. O campo `tour360` ({url}) já é
// parte do schema do anúncio desde a Etapa 3
// (business/listings.js#isValidTour360, business/publishing.js) e não
// tem nenhuma transformação provider-específica para isolar (qualquer
// URL de tour 360° serve — sem parsing de id, sem URL de embed, ao
// contrário do YouTube). O portal só linka pra ela; se ausente, o
// componente não renderiza (§49) — já implementado em
// frontend/portal/render.js.

export {};
