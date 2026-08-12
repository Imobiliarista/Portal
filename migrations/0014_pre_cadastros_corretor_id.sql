-- 0014_pre_cadastros_corretor_id.sql — vincula pre_cadastros ao corretor
-- já criado no momento do pré-cadastro (correção pós-auditoria de fluxo
-- completo).
--
-- Antes desta migration, `pre_cadastros` não tinha nenhuma coluna de
-- vínculo com `corretores` — a única ligação implícita era o e-mail
-- (repetido nas duas tabelas), que não é uma chave segura pra promoção de
-- conta na aprovação: e-mail é editável pelo corretor a qualquer momento
-- (seção 6.1.1), então um corretor que trocasse o e-mail entre o
-- pré-cadastro e a aprovação ficaria órfão de match. `corretor_id` grava
-- o vínculo de forma explícita e imutável no momento da criação.
ALTER TABLE pre_cadastros ADD COLUMN corretor_id INTEGER REFERENCES corretores(id);

CREATE INDEX IF NOT EXISTS idx_pre_cadastros_corretor ON pre_cadastros(corretor_id);
