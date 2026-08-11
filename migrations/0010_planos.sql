-- 0010_planos.sql — Sistema de Planos expandido (Lote 14)
-- Seções 5.1.3, 6.3, 6.4, 6.5, 6.6 do project.md
--
-- NOTA DE MIGRAÇÃO: a tabela `planos` criada em 0001_init.sql guardava,
-- na verdade, configuração de upload por corretor (1 linha por corretor:
-- max_anuncios, max_fotos_por_anuncio, max_resolucao_upload_bytes,
-- google_maps_api_key) — não o catálogo de planos compartilhado descrito
-- na seção 5.1.3/6.3. Ela é renomeada para `config_upload_corretor` e
-- perde as colunas de limite (que agora vêm do plano contratado, via
-- `corretores.plano_id`), liberando o nome `planos` para o catálogo real.

ALTER TABLE planos RENAME TO config_upload_corretor;
ALTER TABLE config_upload_corretor DROP COLUMN max_anuncios;
ALTER TABLE config_upload_corretor DROP COLUMN max_fotos_por_anuncio;

-- Catálogo de Planos — compartilhado, editável pelo Superadmin (6.3)
CREATE TABLE IF NOT EXISTS planos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  max_anuncios INTEGER NOT NULL,
  max_fotos_por_anuncio INTEGER NOT NULL,
  taxa_adesao REAL NOT NULL,
  preco_mensalidade REAL NOT NULL,
  permite_pwa BOOLEAN NOT NULL DEFAULT 0,
  permite_publicacoes BOOLEAN NOT NULL DEFAULT 0,
  permite_api_google_maps BOOLEAN NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT 1,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_planos_ativo ON planos(ativo);

-- Seed inicial — 5 planos de referência (seção 5.1.3), totalmente
-- editáveis depois pelo Superadmin
INSERT INTO planos (nome, max_anuncios, max_fotos_por_anuncio, taxa_adesao, preco_mensalidade, permite_pwa, permite_publicacoes, permite_api_google_maps, ativo) VALUES
  ('Plano 1', 100, 10, 199.00, 49.00, 0, 0, 0, 1),
  ('Plano 2', 200, 15, 199.00, 69.00, 1, 1, 0, 1),
  ('Plano 3', 300, 20, 199.00, 79.00, 1, 1, 0, 1),
  ('Plano 4', 400, 25, 199.00, 89.00, 1, 1, 0, 1),
  ('Plano 5', 500, 30, 199.00, 99.00, 1, 1, 0, 1);

-- Plano contratado + Promoção de Lançamento (6.5) + Isenção genérica (6.6)
ALTER TABLE corretores ADD COLUMN IF NOT EXISTS plano_id INTEGER;
ALTER TABLE corretores ADD COLUMN IF NOT EXISTS promocao_lancamento BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE corretores ADD COLUMN IF NOT EXISTS data_inicio_cobranca DATE;
ALTER TABLE corretores ADD COLUMN IF NOT EXISTS isento BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE corretores ADD COLUMN IF NOT EXISTS isento_ate DATE;
ALTER TABLE corretores ADD COLUMN IF NOT EXISTS motivo_isencao TEXT;

CREATE INDEX IF NOT EXISTS idx_corretores_plano ON corretores(plano_id);
CREATE INDEX IF NOT EXISTS idx_corretores_isento ON corretores(isento);

-- Log de auditoria de isenção (6.6) — quem alterou, quando, valor
-- anterior/novo, motivo — rastreabilidade financeira
CREATE TABLE IF NOT EXISTS log_isencao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  corretor_id INTEGER NOT NULL,
  alterado_por INTEGER NOT NULL,
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT,
  motivo TEXT,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (corretor_id) REFERENCES corretores(id),
  FOREIGN KEY (alterado_por) REFERENCES corretores(id)
);

CREATE INDEX IF NOT EXISTS idx_log_isencao_corretor ON log_isencao(corretor_id);
