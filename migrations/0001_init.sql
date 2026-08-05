-- 0001_init.sql — schema inicial: Anúncio, Corretor, Minisite, Cidade, Plano

-- Tabela de Estados (Brasil)
CREATE TABLE IF NOT EXISTS estados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  uf TEXT NOT NULL UNIQUE,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Cidades (IBGE)
CREATE TABLE IF NOT EXISTS cidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_ibge INTEGER UNIQUE,
  nome TEXT NOT NULL,
  estado_id INTEGER NOT NULL,
  uf TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  ativo BOOLEAN DEFAULT 1,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (estado_id) REFERENCES estados(id)
);

-- Índices para cidades (filtros frequentes)
CREATE INDEX IF NOT EXISTS idx_cidades_estado ON cidades(estado_id);
CREATE INDEX IF NOT EXISTS idx_cidades_ativo ON cidades(ativo);

-- Tabela de Corretores/Usuários
CREATE TABLE IF NOT EXISTS corretores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Dados de identidade (imutáveis após cadastro)
  nome_completo TEXT NOT NULL,
  sexo TEXT,
  data_nascimento DATE,
  nacionalidade TEXT,
  cpf TEXT NOT NULL UNIQUE,
  creci TEXT NOT NULL UNIQUE,

  -- Autenticação
  nome_usuario TEXT UNIQUE,
  senha_hash TEXT NOT NULL,

  -- Dados de contato (editáveis)
  endereco_residencial TEXT,
  telefone TEXT,
  email TEXT NOT NULL UNIQUE,
  whatsapp TEXT,

  -- Status de aprovação
  status TEXT DEFAULT 'pre-cadastro', -- 'pre-cadastro', 'aprovado', 'reprovado'
  motivo_reprovacao TEXT,

  -- Timestamps
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices para corretores
CREATE INDEX IF NOT EXISTS idx_corretores_cpf ON corretores(cpf);
CREATE INDEX IF NOT EXISTS idx_corretores_email ON corretores(email);
CREATE INDEX IF NOT EXISTS idx_corretores_status ON corretores(status);

-- Tabela de Minisites
CREATE TABLE IF NOT EXISTS minisites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  corretor_id INTEGER NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE, -- subdomínio (ex: "marcos", "joao-silva")
  offline BOOLEAN DEFAULT 1, -- começa offline até aprovação
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (corretor_id) REFERENCES corretores(id)
);

-- Tabela de Planos
CREATE TABLE IF NOT EXISTS planos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  corretor_id INTEGER NOT NULL UNIQUE,
  max_anuncios INTEGER DEFAULT 100,
  max_fotos_por_anuncio INTEGER DEFAULT 20,
  max_resolucao_upload_bytes INTEGER DEFAULT 5242880, -- 5 MB
  google_maps_api_key TEXT,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (corretor_id) REFERENCES corretores(id)
);

-- Tabela de Tipos de Negócio
CREATE TABLE IF NOT EXISTS tipos_negocio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE, -- 'Venda', 'Locação'
  slug TEXT NOT NULL UNIQUE, -- 'venda', 'locacao'
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Categorias de Imóvel
CREATE TABLE IF NOT EXISTS categorias_imovel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE, -- 'Residencial', 'Comercial', 'Corporativo', 'Industrial', 'Rural'
  slug TEXT NOT NULL UNIQUE, -- 'residencial', 'comercial', etc.
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Tipos de Imóvel (por categoria)
CREATE TABLE IF NOT EXISTS tipos_imovel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id INTEGER NOT NULL,
  nome TEXT NOT NULL, -- 'Apartamento', 'Casa', 'Terreno', etc.
  slug TEXT NOT NULL, -- 'apartamento', 'casa', etc.
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (categoria_id) REFERENCES categorias_imovel(id),
  UNIQUE(categoria_id, nome)
);

-- Índices para tipos de imóvel
CREATE INDEX IF NOT EXISTS idx_tipos_imovel_categoria ON tipos_imovel(categoria_id);

-- Tabela de Anúncios
CREATE TABLE IF NOT EXISTS anuncios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  corretor_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,

  -- Preço
  preco_venda REAL,
  preco_aluguel REAL,

  -- Taxonomia
  tipo_negocio_id INTEGER NOT NULL,
  categoria_imovel_id INTEGER NOT NULL,
  tipo_imovel_id INTEGER NOT NULL,

  -- Localização
  cidade_id INTEGER NOT NULL,
  bairro TEXT,
  endereco_completo TEXT,
  exibir_endereco_completo BOOLEAN DEFAULT 0,

  -- Especificações
  area_total REAL,
  area_util REAL,
  quartos INTEGER,
  banheiros INTEGER,
  vagas_garagem INTEGER,
  cozinhas INTEGER,
  lavanderias INTEGER,

  -- Mídia
  fotos_json TEXT, -- JSON array de URLs de fotos
  video_youtube_id TEXT,
  tour_360_url TEXT,

  -- Status de publicação
  postar_na_rede BOOLEAN DEFAULT 1,

  -- Status de vendido/removido (HTTP 410)
  vendido_removido BOOLEAN DEFAULT 0,

  -- Para URL amigável: /cidade/negocio/tipo/slug-id
  slug TEXT NOT NULL,

  -- Timestamps
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (corretor_id) REFERENCES corretores(id),
  FOREIGN KEY (tipo_negocio_id) REFERENCES tipos_negocio(id),
  FOREIGN KEY (categoria_imovel_id) REFERENCES categorias_imovel(id),
  FOREIGN KEY (tipo_imovel_id) REFERENCES tipos_imovel(id),
  FOREIGN KEY (cidade_id) REFERENCES cidades(id)
);

-- Índices para anúncios (filtros e regeneração em lote)
CREATE INDEX IF NOT EXISTS idx_anuncios_corretor ON anuncios(corretor_id);
CREATE INDEX IF NOT EXISTS idx_anuncios_cidade ON anuncios(cidade_id);
CREATE INDEX IF NOT EXISTS idx_anuncios_postar_na_rede ON anuncios(postar_na_rede);
CREATE INDEX IF NOT EXISTS idx_anuncios_publicado ON anuncios(vendido_removido);
CREATE INDEX IF NOT EXISTS idx_anuncios_tipo_negocio ON anuncios(tipo_negocio_id);
CREATE INDEX IF NOT EXISTS idx_anuncios_categoria ON anuncios(categoria_imovel_id);

-- Tabela de Pré-Cadastros (pendentes de aprovação)
CREATE TABLE IF NOT EXISTS pre_cadastros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telefone TEXT NOT NULL,
  creci TEXT NOT NULL,

  -- Aceite de termos
  aceite_termos_em DATETIME,
  versao_termos_aceita TEXT,

  -- Status de aprovação
  status TEXT DEFAULT 'pendente', -- 'pendente', 'aprovado', 'reprovado'
  motivo_reprovacao TEXT,

  -- Timestamps
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices para pré-cadastros
CREATE INDEX IF NOT EXISTS idx_pre_cadastros_email ON pre_cadastros(email);
CREATE INDEX IF NOT EXISTS idx_pre_cadastros_status ON pre_cadastros(status);

-- Tabela de Cotas por Portal Externo
CREATE TABLE IF NOT EXISTS cotas_portal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  corretor_id INTEGER NOT NULL,
  portal_nome TEXT NOT NULL, -- 'grupo-olx', 'imovelweb', 'chaves-na-mao', etc.
  quantidade_contratada INTEGER, -- NULL = ilimitado
  ativo BOOLEAN DEFAULT 0, -- começa desligado por padrão
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (corretor_id) REFERENCES corretores(id),
  UNIQUE(corretor_id, portal_nome)
);

-- Índices para cotas de portal
CREATE INDEX IF NOT EXISTS idx_cotas_portal_corretor ON cotas_portal(corretor_id);
CREATE INDEX IF NOT EXISTS idx_cotas_portal_ativo ON cotas_portal(ativo);
