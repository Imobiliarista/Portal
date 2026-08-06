-- 0009_agendamentos_visita.sql — Tabela para agendamento de visita a imóveis (Lote 12.7)
-- Seção 2.1 do project.md
-- Visitante solicita visita em um anúncio; corretor confirma ou recusa; sistema dispara e-mails

CREATE TABLE IF NOT EXISTS agendamentos_visita (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anuncio_id INTEGER NOT NULL,
  corretor_id INTEGER NOT NULL,
  nome_visitante TEXT NOT NULL,
  telefone_visitante TEXT NOT NULL,
  email_visitante TEXT NOT NULL,
  data_horario_sugerido DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente/confirmado/recusado/cancelado
  motivo_recusa TEXT, -- Opcional: motivo quando recusa
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  respondido_em DATETIME,
  FOREIGN KEY (anuncio_id) REFERENCES anuncios(id),
  FOREIGN KEY (corretor_id) REFERENCES corretores(id)
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_agendamentos_corretor ON agendamentos_visita(corretor_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_anuncio ON agendamentos_visita(anuncio_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos_visita(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_criado ON agendamentos_visita(criado_em);
