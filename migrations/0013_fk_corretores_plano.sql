-- 0013_fk_corretores_plano.sql — adiciona FOREIGN KEY em corretores.plano_id
-- referenciando planos(id) (correção pós-auditoria de roteamento/migrations).
--
-- A coluna `plano_id` foi criada em 0010_planos.sql sem FOREIGN KEY —
-- hoje um plano_id inválido/órfão não é barrado pelo banco. SQLite não
-- suporta ALTER TABLE ... ADD CONSTRAINT nem adicionar FOREIGN KEY a uma
-- coluna já existente via ALTER TABLE — a única forma é recriar a tabela
-- (padrão "12 passos" documentado pelo próprio SQLite:
-- https://www.sqlite.org/lang_altertable.html#otheralter). Migration nova
-- em vez de editar a 0010 já commitada/aplicada.

CREATE TABLE corretores_novo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  nome_completo TEXT NOT NULL,
  sexo TEXT,
  data_nascimento DATE,
  nacionalidade TEXT,
  cpf TEXT NOT NULL UNIQUE,
  creci TEXT NOT NULL UNIQUE,

  nome_usuario TEXT UNIQUE,
  senha_hash TEXT NOT NULL,

  endereco_residencial TEXT,
  telefone TEXT,
  email TEXT NOT NULL UNIQUE,
  whatsapp TEXT,

  status TEXT DEFAULT 'pre-cadastro',
  motivo_reprovacao TEXT,

  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

  senha_salt TEXT,
  papel TEXT DEFAULT 'corretor',

  plano_id INTEGER,
  promocao_lancamento BOOLEAN NOT NULL DEFAULT 0,
  data_inicio_cobranca DATE,
  isento BOOLEAN NOT NULL DEFAULT 0,
  isento_ate DATE,
  motivo_isencao TEXT,

  config_modulos TEXT NOT NULL DEFAULT '{}',

  FOREIGN KEY (plano_id) REFERENCES planos(id)
);

INSERT INTO corretores_novo SELECT * FROM corretores;

DROP TABLE corretores;

ALTER TABLE corretores_novo RENAME TO corretores;

-- Reconstrói os índices nomeados (os índices automáticos de UNIQUE são
-- recriados junto com a tabela)
CREATE INDEX IF NOT EXISTS idx_corretores_cpf ON corretores(cpf);
CREATE INDEX IF NOT EXISTS idx_corretores_email ON corretores(email);
CREATE INDEX IF NOT EXISTS idx_corretores_status ON corretores(status);
CREATE INDEX IF NOT EXISTS idx_corretores_plano ON corretores(plano_id);
CREATE INDEX IF NOT EXISTS idx_corretores_isento ON corretores(isento);
