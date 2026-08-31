// business/amenities.js
//
// Vocabulário fixo de comodidades/proximidades (`listing.amenities`, Etapa
// "NOVOS CAMPOS NO MODELO DE IMÓVEL, PARTE 2"), alinhado ao elemento
// `Features`/`Feature` do padrão VRSync
// (developers.grupozap.com/feeds/vrsync/elements/details.html#features).
//
// Cada id é literalmente o texto que vai dentro de `<Feature>` no feed
// (modules/feeds/formatters/vrsync.js) — não um slug interno do projeto —
// por isso os ids têm maiúsculas/espaços em vez do padrão kebab-case usado
// em outros enums (ex. `business/listings.js#PURPOSES`). `label` é só o
// rótulo pt-BR para um futuro filtro/formulário do painel (fora do escopo
// desta etapa — ver PR).
//
// Curada pelo dono do projeto nesta etapa a partir do vocabulário real de
// portais (GrupoZAP/OLX/ZAP/VivaReal) — não é o enum completo que a doc
// oficial do VRSync define, só o subconjunto confirmado. Um valor fora
// desta lista é rejeitado por `business/listings.js` (não inventar um id
// novo por conta própria).
//
// Mantido em sincronia à mão com o enum `amenities` de
// schemas/listing-draft.schema.json e schemas/listing-public.schema.json —
// mesmo padrão já usado para `PURPOSES`/`LISTING_STATUSES` (JS <-> JSON
// Schema sem uma fonte de geração automática, §94).
export const AMENITIES = Object.freeze([
  { id: "Pool", label: "Piscina" },
  { id: "Elevator", label: "Elevador" },
  { id: "Gym", label: "Academia" },
  { id: "Sauna", label: "Sauna" },
  { id: "Playground", label: "Playground" },
  { id: "Party Room", label: "Salão de Festas" },
  { id: "Sports Court", label: "Quadra poliesportiva" },
  { id: "BBQ", label: "Churrasqueira" },
  { id: "Gourmet Area", label: "Espaço gourmet" },
  { id: "Balcony", label: "Varanda" },
  { id: "Garden Area", label: "Jardim" },
  { id: "Backyard", label: "Quintal" },
  { id: "Fireplace", label: "Lareira" },
  { id: "Builtin Wardrobe", label: "Armário embutido" },
  { id: "Closet", label: "Closet" },
  { id: "Furnished", label: "Mobiliado" },
  { id: "Cooling", label: "Ar condicionado" },
  { id: "Heating", label: "Aquecimento" },
  { id: "Solar Energy", label: "Energia solar" },
  { id: "Generator", label: "Gerador elétrico" },
  { id: "Intercom", label: "Interfone" },
  { id: "Electronic Gate", label: "Portão eletrônico" },
  { id: "Security Camera", label: "Câmera de segurança" },
  { id: "Security Guard on Duty", label: "Segurança 24h" },
  { id: "Fenced Yard", label: "Condomínio fechado" },
  { id: "Home Office", label: "Escritório" },
  { id: "Coworking", label: "Coworking" },
  { id: "Pet Space", label: "Espaço Pet" },
  { id: "Pets Allowed", label: "Permite animais" },
  { id: "American Kitchen", label: "Cozinha americana" },
  { id: "Gourmet Kitchen", label: "Cozinha Gourmet" },
  { id: "Laundry", label: "Lavanderia" },
  { id: "Edicule", label: "Edícula" },
  { id: "Deck", label: "Deck" },
  { id: "Close to schools", label: "Perto de escolas" },
  { id: "Close to hospitals", label: "Perto de hospitais" },
  { id: "Close to public transportation", label: "Perto de transporte público" },
  { id: "Close to shopping centers", label: "Perto de shopping center" },
  { id: "Close to main roads/avenues", label: "Perto de vias de acesso" },
]);

export const AMENITY_IDS = Object.freeze(AMENITIES.map((amenity) => amenity.id));
