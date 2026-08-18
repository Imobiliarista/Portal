-- 0015_feed_olx_cep_publicar.sql — CEP e toggle real de publicação no
-- Grupo OLX, por anúncio (reconstrução do feed VRSync, seção 4.11).
--
-- Duas colunas aditivas em anuncios:
--
-- 1) `cep` — a OLX exige CEP no XML; a tabela nunca teve essa coluna (só
--    cidade/bairro/endereço). Nullable: anúncios existentes ficam sem CEP
--    até o corretor preencher. Obrigatoriedade real é aplicada no momento
--    de salvar o anúncio, condicionada a `publicar_grupo_olx = true` (ver
--    routes/api-anuncios-crud.ts) — não um NOT NULL de banco, porque o
--    campo é opcional pra quem nunca publica no Grupo OLX.
--
-- 2) `publicar_grupo_olx` — toggle real por anúncio, decidido em vez de
--    reaproveitar o campo `priorizado` (referenciado em
--    feed-grupo-olx/gerador.ts e feed-portais-independentes/gerador.ts,
--    mas nunca ligado a nenhuma coluna — sempre `undefined` em produção,
--    então a "prioridade manual" que o project.md já descrevia como
--    decidida nunca existiu de fato). Este campo assume as duas funções
--    que `priorizado` deveria ter: é o próprio filtro de elegibilidade
--    pro feed do Grupo OLX (não basta `postar_na_rede = true`) e, dentro
--    do conjunto marcado, a cota contratada corta por mais recente
--    primeiro — sem uma segunda camada de prioridade manual, já que
--    marcar o campo é o próprio ato de priorizar. Escopo só do Grupo
--    OLX — outros portais independentes continuam elegíveis via
--    `postar_na_rede`, sem toggle próprio (ver plano de reconstrução do
--    feed, não incluído aqui por decisão explícita).
--
--    Nasce `0` pra todo anúncio existente — nenhum anúncio passa a ser
--    publicado no Grupo OLX sozinho por causa desta migration.

ALTER TABLE anuncios ADD COLUMN cep TEXT;
ALTER TABLE anuncios ADD COLUMN publicar_grupo_olx BOOLEAN NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_anuncios_publicar_grupo_olx ON anuncios(publicar_grupo_olx);
