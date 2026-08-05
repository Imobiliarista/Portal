-- 0002_taxonomia.sql — tabelas de Tipo de Negócio e Categoria/Tipo de Imóvel, populadas com taxonomia completa

-- Tipos de Negócio
INSERT INTO tipos_negocio (nome, slug) VALUES
  ('Venda', 'venda'),
  ('Locação', 'locacao');

-- Categorias de Imóvel
INSERT INTO categorias_imovel (nome, slug) VALUES
  ('Residencial', 'residencial'),
  ('Comercial', 'comercial'),
  ('Corporativo', 'corporativo'),
  ('Industrial', 'industrial'),
  ('Rural', 'rural');

-- Tipos de Imóvel por Categoria

-- Residencial
INSERT INTO tipos_imovel (categoria_id, nome, slug) VALUES
  ((SELECT id FROM categorias_imovel WHERE slug = 'residencial'), 'Apartamento', 'apartamento'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'residencial'), 'Área', 'area'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'residencial'), 'Casa', 'casa'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'residencial'), 'Chácara', 'chacara'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'residencial'), 'Cobertura', 'cobertura'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'residencial'), 'Terreno', 'terreno');

-- Comercial
INSERT INTO tipos_imovel (categoria_id, nome, slug) VALUES
  ((SELECT id FROM categorias_imovel WHERE slug = 'comercial'), 'Área', 'area'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'comercial'), 'Barracão', 'barracao'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'comercial'), 'Casa', 'casa'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'comercial'), 'Galpão', 'galpao'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'comercial'), 'Loja', 'loja'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'comercial'), 'Prédio', 'predio'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'comercial'), 'Sala', 'sala'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'comercial'), 'Salão', 'salao'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'comercial'), 'Terreno', 'terreno');

-- Corporativo
INSERT INTO tipos_imovel (categoria_id, nome, slug) VALUES
  ((SELECT id FROM categorias_imovel WHERE slug = 'corporativo'), 'Área', 'area'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'corporativo'), 'Barracão', 'barracao'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'corporativo'), 'Casa', 'casa'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'corporativo'), 'Galpão', 'galpao'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'corporativo'), 'Loja', 'loja'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'corporativo'), 'Prédio', 'predio'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'corporativo'), 'Sala', 'sala'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'corporativo'), 'Salão', 'salao'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'corporativo'), 'Terreno', 'terreno');

-- Industrial
INSERT INTO tipos_imovel (categoria_id, nome, slug) VALUES
  ((SELECT id FROM categorias_imovel WHERE slug = 'industrial'), 'Área', 'area'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'industrial'), 'Barracão', 'barracao'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'industrial'), 'Galpão', 'galpao'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'industrial'), 'Salão', 'salao'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'industrial'), 'Terreno', 'terreno');

-- Rural
INSERT INTO tipos_imovel (categoria_id, nome, slug) VALUES
  ((SELECT id FROM categorias_imovel WHERE slug = 'rural'), 'Área', 'area'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'rural'), 'Casa', 'casa'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'rural'), 'Chácara', 'chacara'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'rural'), 'Fazenda', 'fazenda'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'rural'), 'Sítio', 'sitio'),
  ((SELECT id FROM categorias_imovel WHERE slug = 'rural'), 'Terreno', 'terreno');
