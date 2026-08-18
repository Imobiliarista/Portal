-- 0016_fusao_grupo_olx_portal.sql — trata o Grupo OLX como mais uma linha
-- de `portais_independentes`, eliminando o módulo `feed-grupo-olx`
-- separado (reconstrução do feed VRSync, seção 4.11).
--
-- O Grupo OLX já usava o mesmo mecanismo de `cotas_portal`
-- (`portal_nome = 'grupo-olx'`) que qualquer portal independente — a
-- única diferença real era não ter linha em `portais_independentes` e
-- depender de uma flag própria em `modulos_ativos` (`feed-grupo-olx`,
-- separada de `feed-portais-independentes`). A URL pública já era
-- compatível: `/feeds/grupo-olx/{slug}.xml` bate no mesmo padrão
-- genérico `/feeds/{portal}/{slug}.{ext}` que a rota de portais
-- independentes já serve — nenhuma URL colada por um corretor no Canal
-- Pro muda com esta migration.
--
-- `modulo_flag_slug` torna a checagem de módulo-de-rede por portal um
-- dado, não um caso especial no código: cada linha diz qual flag de
-- `modulos_ativos` checar antes de servir/gerar aquele feed. Grupo OLX
-- aponta pra `feed-grupo-olx` (preserva o histórico de quem já
-- ativou/desativou essa flag em produção — a migration não mexe em
-- `modulos_ativos`, só referencia a flag existente); os demais
-- continuam em `feed-portais-independentes`.
--
-- `cotas_portal` não é tocada — linhas já existentes com
-- `portal_nome = 'grupo-olx'` continuam valendo, nenhum corretor perde
-- a ativação já feita.

ALTER TABLE portais_independentes ADD COLUMN modulo_flag_slug TEXT;

UPDATE portais_independentes SET modulo_flag_slug = 'feed-portais-independentes';

INSERT INTO portais_independentes (nome, slug, formato, ativo, descricao, modulo_flag_slug)
VALUES (
  'Grupo OLX',
  'grupo-olx',
  'vrsync-xml',
  1,
  'OLX + ZAP + VivaReal — feed único via VRSync (Canal Pro)',
  'feed-grupo-olx'
);
