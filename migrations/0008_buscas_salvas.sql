-- 0008_buscas_salvas.sql — Tabela para buscas salvas com alertas por e-mail (Lote 12.6)
-- Seção 2.1 e 5.3 do project.md
-- Visitante salva critérios de busca; sistema dispara e-mail quando há novo anúncio compatível

CREATE TABLE IF NOT EXISTS buscas_salvas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  criterios TEXT NOT NULL, -- JSON com { cidade, tipo_negocio, categoria, tipo_imovel, preco_min, preco_max, quartos, banheiros, ... }
  token_cancelamento TEXT NOT NULL UNIQUE,
  notificacoes_enviadas TEXT, -- JSON array de { anuncio_id, enviado_em } para evitar duplicação
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  ultima_notificacao_em DATETIME,
  ativo BOOLEAN DEFAULT 1
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_buscas_email ON buscas_salvas(email);
CREATE INDEX IF NOT EXISTS idx_buscas_token ON buscas_salvas(token_cancelamento);
CREATE INDEX IF NOT EXISTS idx_buscas_criado ON buscas_salvas(criado_em);
CREATE INDEX IF NOT EXISTS idx_buscas_ativo ON buscas_salvas(ativo);
