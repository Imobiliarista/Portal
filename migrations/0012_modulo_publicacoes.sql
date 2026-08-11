-- 0012_modulo_publicacoes.sql — registra o módulo Publicações (Lote 16)
-- Seção 4.19 do project.md
--
-- Controle duplo igual ao PWA (0011_modulo_pwa.sql): flag de rede em
-- modulos_ativos + campo do plano (permite_publicacoes, já existe desde
-- 0010_planos.sql). Diferente do PWA, este módulo começa DESLIGADO por
-- padrão (ativo = 0) — não havia comportamento legado em produção a
-- preservar, ao contrário do PWA que já existia como recurso universal
-- desde o Lote 10.
--
-- `config_modulos` é um campo JSON genérico por corretor, pensado para
-- guardar configuração de qualquer módulo opcional que precise de dados
-- específicos do corretor (não só rede/plano) — hoje só usado por
-- Publicações (`config_modulos.publicacoes` → { ativo, usarFeedPadrao,
-- feedUrl }, ver 4.19), mas o nome não é específico de Publicações para
-- não exigir uma coluna nova a cada módulo futuro com a mesma necessidade.

INSERT INTO modulos_ativos (nome, slug, descricao, ativo) VALUES
  ('Publicações', 'publicacoes', 'Feed de blog do corretor (Blogspot próprio ou Feed Padrão da Rede) exibido no menu principal do minisite. Também depende de permite_publicacoes no plano do corretor.', 0);

ALTER TABLE corretores ADD COLUMN config_modulos TEXT NOT NULL DEFAULT '{}';
