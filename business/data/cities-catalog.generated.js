// business/data/cities-catalog.generated.js
//
// GERADO por scripts/generate-cities-catalog.js — não editar à mão.
// Formato: slug -> { name, uf, ibgeCode }.
//
// *** PLACEHOLDER — NÃO é o catálogo nacional completo. ***
// PENDÊNCIA BLOQUEANTE (Etapa 6, ver PR): esta sessão de trabalho não tinha
// acesso de rede a servicodados.ibge.gov.br (política de egress do
// ambiente) para rodar o gerador de verdade. Antes do deploy, alguém com
// rede liberada deve rodar:
//
//   node scripts/generate-cities-catalog.js
//
// e commitar o resultado (cobertura nacional, ~5.570 municípios do IBGE),
// substituindo este arquivo por inteiro. Até lá, qualquer cidade fora desta
// amostra é rejeitada explicitamente por business/cities.js#requireCityBySlug
// (UnknownCityError) — o publicador nunca inventa name/uf para uma cidade
// desconhecida (§12).
//
// A amostra abaixo cobre só o suficiente para os testes automatizados deste
// repositório, incluindo um par de nomes duplicados em UFs diferentes
// ("bom-jesus-pi" / "bom-jesus-rs") para exercitar o desempate por UF que o
// gerador aplica de verdade. Os ibgeCode desse par são sintéticos
// (000000001/000000002) — não são códigos IBGE reais, só marcam a amostra
// como placeholder de forma inconfundível.

export const CITY_CATALOG = {
  "curitiba": { name: "Curitiba", uf: "PR", ibgeCode: 4106902 },
  "londrina": { name: "Londrina", uf: "PR", ibgeCode: 4113700 },
  "rio-de-janeiro": { name: "Rio de Janeiro", uf: "RJ", ibgeCode: 3304557 },
  "sao-paulo": { name: "São Paulo", uf: "SP", ibgeCode: 3550308 },
  "bom-jesus-pi": { name: "Bom Jesus", uf: "PI", ibgeCode: 1 },
  "bom-jesus-rs": { name: "Bom Jesus", uf: "RS", ibgeCode: 2 },
};
