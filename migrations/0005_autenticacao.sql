-- 0005_autenticacao.sql — campos adicionais para autenticação (Lote 3)
-- Adiciona salt para PBKDF2 e tokens de redefinição de senha

-- Adiciona coluna de salt (se não existir)
-- SQLite não suporta ALTER COLUMN, então usamos uma abordagem de coluna nova
ALTER TABLE corretores ADD COLUMN IF NOT EXISTS senha_salt TEXT;

-- Tabela para tokens de redefinição de senha
CREATE TABLE IF NOT EXISTS reset_tokens_senha (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  corretor_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expira_em DATETIME NOT NULL,
  usado BOOLEAN DEFAULT 0,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (corretor_id) REFERENCES corretores(id)
);

-- Índices para tokens de redefinição
CREATE INDEX IF NOT EXISTS idx_reset_tokens_corretor ON reset_tokens_senha(corretor_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON reset_tokens_senha(token);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expira ON reset_tokens_senha(expira_em);

-- Tabela para sessões de autenticação (validação de cookies)
CREATE TABLE IF NOT EXISTS sessoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  corretor_id INTEGER NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  expira_em DATETIME NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (corretor_id) REFERENCES corretores(id)
);

-- Índices para sessões
CREATE INDEX IF NOT EXISTS idx_sessoes_corretor ON sessoes(corretor_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_session_id ON sessoes(session_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes(expira_em);
