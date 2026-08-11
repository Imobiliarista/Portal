-- 0006_superadmin.sql — campos para Superadmin e 2FA (Lote 9)
-- Adiciona papel/role aos corretores e tabelas de 2FA

-- Adiciona coluna de papel (padrão: 'corretor', alguns podem ser 'superadmin')
ALTER TABLE corretores ADD COLUMN papel TEXT DEFAULT 'corretor';

-- Tabela para 2FA (TOTP via authenticator app)
CREATE TABLE IF NOT EXISTS dois_fa_totp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  corretor_id INTEGER NOT NULL UNIQUE,
  secret_key TEXT NOT NULL, -- chave secreta do TOTP (base32)
  backup_codes TEXT NOT NULL, -- JSON array de códigos de backup (10 códigos)
  ativo BOOLEAN DEFAULT 0,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (corretor_id) REFERENCES corretores(id)
);

-- Índices para 2FA
CREATE INDEX IF NOT EXISTS idx_dois_fa_totp_corretor ON dois_fa_totp(corretor_id);
