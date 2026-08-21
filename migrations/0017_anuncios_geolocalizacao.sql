-- 0017_anuncios_geolocalizacao.sql — latitude/longitude por anúncio
--
-- Gap encontrado ao preparar scripts/seed-anuncios-teste.js: o mapa de
-- listagem/detalhe (Leaflet+OSM, public/assets/js/mapa.js) foi ligado na UI
-- pelo commit 8bb4f5f ("Liga o mapa da listagem/detalhe") e já lê
-- `listing.latitude`/`listing.longitude` de cada anúncio — mas a tabela
-- `anuncios` nunca teve essas colunas (só `cidades` tem lat/long) e nenhum
-- job de geração de JSON (gerar-json-cidade.ts, gerar-json-corretor.ts) as
-- emitia. Resultado: nenhum anúncio real podia ter pin no mapa, mesmo com
-- coordenadas cadastradas em algum lugar — porque não havia onde cadastrar.
--
-- Duas colunas aditivas, nullable: nem todo anúncio tem geocodificação, e
-- mapa.js já trata ausência de coordenada (guard `listing.latitude &&
-- listing.longitude` em initListingMap/initDetailMap) — não é NOT NULL.

ALTER TABLE anuncios ADD COLUMN latitude REAL;
ALTER TABLE anuncios ADD COLUMN longitude REAL;
