// Gera o manifest.json do Portal Principal e dos minisites (Lote 15,
// seção 4.18). Nunca aponta para arquivo inexistente: usa os ícones
// genéricos da rede (public/icons/, já servidos em qualquer hostname —
// portal e minisites compartilham o mesmo deploy de Static Assets).
//
// Fallback de ícone: o corretor ainda não tem nenhum campo de logo no
// schema (nenhuma migration expõe upload de logo por corretor até o
// Lote 15) — então hoje o fallback genérico é o único caminho possível.
// Quando um lote futuro adicionar upload de logo do corretor, plugue a
// checagem de "logo processável" aqui antes de cair no fallback.

interface IconeManifest {
  src: string;
  sizes: string;
  type: string;
  purpose: "any" | "maskable";
}

const ICONES_GENERICOS: IconeManifest[] = [
  { src: "/icons/icon-72x72.png", sizes: "72x72", type: "image/png", purpose: "any" },
  { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png", purpose: "any" },
  { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png", purpose: "any" },
  { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png", purpose: "any" },
  { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png", purpose: "any" },
  { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-192x192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
  { src: "/icons/icon-512x512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

export interface ManifestPwa {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  background_color: string;
  theme_color: string;
  icons: IconeManifest[];
  categories?: string[];
}

export function gerarManifestPortal(): ManifestPwa {
  return {
    name: "Portal Imobiliário",
    short_name: "Portal Imóveis",
    description: "Portal de anúncios de imóveis com venda e aluguel em todo o Brasil",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: ICONES_GENERICOS,
    categories: ["productivity", "shopping"],
  };
}

function abreviarPrimeiroNome(nomeCompleto: string): string {
  const primeiro = nomeCompleto.trim().split(/\s+/)[0];
  return primeiro || "Imóveis";
}

export function gerarManifestCorretor(nomeCorretor: string): ManifestPwa {
  return {
    name: `${nomeCorretor} — Imóveis`,
    short_name: abreviarPrimeiroNome(nomeCorretor),
    description: `Imóveis de ${nomeCorretor} — venda e aluguel`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: ICONES_GENERICOS,
  };
}
