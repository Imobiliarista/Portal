-- 0007_portais_independentes.sql — tabela de portais independentes cadastrados
-- Diferente de modulos_ativos (que liga/desliga a FUNCIONALIDADE toda),
-- aqui é a lista de portais individuais disponíveis para os corretores escolherem
-- Conforme seção 4.11 e Lote 12.2 do project.md

CREATE TABLE IF NOT EXISTS portais_independentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE, -- 'ImóvelWeb', 'Chaves na Mão', 'Órulo', etc.
  slug TEXT NOT NULL UNIQUE, -- 'imovelweb', 'chaves-na-mao', 'orulo', etc.
  formato TEXT DEFAULT 'vrsync-xml', -- 'vrsync-xml', 'csv', 'json' — formato do arquivo esperado
  ativo BOOLEAN DEFAULT 0, -- padrão: desativado; Superadmin ativa/desativa
  descricao TEXT,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Inserção inicial de portais independentes conhecidos (desativados por padrão)
INSERT INTO portais_independentes (nome, slug, formato, ativo, descricao) VALUES
  ('ImóvelWeb', 'imovelweb', 'vrsync-xml', 0, 'Portal de anúncios imobiliários'),
  ('Chaves na Mão', 'chaves-na-mao', 'vrsync-xml', 0, 'Portal de imóveis e locação'),
  ('Órulo', 'orulo', 'vrsync-xml', 0, 'Plataforma de anúncios imobiliários');

-- Índices para portais independentes
CREATE INDEX IF NOT EXISTS idx_portais_independentes_slug ON portais_independentes(slug);
CREATE INDEX IF NOT EXISTS idx_portais_independentes_ativo ON portais_independentes(ativo);
