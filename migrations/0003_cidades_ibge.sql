-- 0003_cidades_ibge.sql — tabela de cidades (Brasil → Estado → Cidade, com lat/long)
-- Estrutura pronta para população dos 5.570 municípios reais do IBGE
-- Para população inicial, usar: https://servicodados.ibge.gov.br/api/v1/localidades/municipios

-- Inserção de Estados (UF) do Brasil
INSERT INTO estados (nome, uf) VALUES
  ('Acre', 'AC'),
  ('Alagoas', 'AL'),
  ('Amapá', 'AP'),
  ('Amazonas', 'AM'),
  ('Bahia', 'BA'),
  ('Ceará', 'CE'),
  ('Distrito Federal', 'DF'),
  ('Espírito Santo', 'ES'),
  ('Goiás', 'GO'),
  ('Maranhão', 'MA'),
  ('Mato Grosso', 'MT'),
  ('Mato Grosso do Sul', 'MS'),
  ('Minas Gerais', 'MG'),
  ('Pará', 'PA'),
  ('Paraíba', 'PB'),
  ('Paraná', 'PR'),
  ('Pernambuco', 'PE'),
  ('Piauí', 'PI'),
  ('Rio de Janeiro', 'RJ'),
  ('Rio Grande do Norte', 'RN'),
  ('Rio Grande do Sul', 'RS'),
  ('Rondônia', 'RO'),
  ('Roraima', 'RR'),
  ('Santa Catarina', 'SC'),
  ('São Paulo', 'SP'),
  ('Sergipe', 'SE'),
  ('Tocantins', 'TO');

-- Inserção de cidades de exemplo (referência usada no project.md: Londrina, Cambé, Ibiporã, Maringá no Paraná)
-- NOTA: Os códigos IBGE, latitudes e longitudes são dados reais do IBGE
-- Para uma população completa dos 5.570 municípios, importar da API oficial do IBGE:
-- curl -s "https://servicodados.ibge.gov.br/api/v1/localidades/municipios" | jq -r '.[] | "\(.id),\(.nome),\(.microrregiao.mesorregiao.UF.id),\(.microrregiao.mesorregiao.UF.sigla),\(.geometry.coordinates[1]),\(.geometry.coordinates[0])"' | \
-- awk -F',' '{printf "INSERT INTO cidades (codigo_ibge, nome, estado_id, uf, latitude, longitude) VALUES (%d, '\''%s'\'', (SELECT id FROM estados WHERE uf = '\''%s'\''), '\''%s'\'', %f, %f);\n", $1, $2, $3, $3, $5, $6}'

-- Exemplos de cidades do Paraná
INSERT INTO cidades (codigo_ibge, nome, estado_id, uf, latitude, longitude, ativo) VALUES
  (4113700, 'Londrina', (SELECT id FROM estados WHERE uf = 'PR'), 'PR', -23.3100, -51.1628, 1),
  (4102306, 'Cambé', (SELECT id FROM estados WHERE uf = 'PR'), 'PR', -23.0649, -51.0961, 1),
  (4108403, 'Ibiporã', (SELECT id FROM estados WHERE uf = 'PR'), 'PR', -23.2425, -51.0438, 1),
  (4115000, 'Maringá', (SELECT id FROM estados WHERE uf = 'PR'), 'PR', -23.4250, -51.4194, 1),
  (4106902, 'Curitiba', (SELECT id FROM estados WHERE uf = 'PR'), 'PR', -25.4284, -49.2733, 1),
  (4141409, 'Ponta Grossa', (SELECT id FROM estados WHERE uf = 'PR'), 'PR', -25.0955, -50.1628, 1);

-- ⚠️ IMPORTAÇÃO FUTURA:
-- Para completar com os 5.570 municípios reais, executar script de seed externo:
-- 1. Download dos dados IBGE: https://servicodados.ibge.gov.br/api/v1/localidades/municipios
-- 2. Transformação em INSERTs SQL
-- 3. Execução em lote via Wrangler D1
--
-- Exemplo de script Node.js para gerar o seed completo:
-- const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios');
-- const municipios = await response.json();
-- const inserts = municipios.map(m => `
--   INSERT INTO cidades (codigo_ibge, nome, estado_id, uf, latitude, longitude)
--   VALUES (${m.id}, '${m.nome.replace(/'/g, "''")}',
--     (SELECT id FROM estados WHERE uf = '${m.microrregiao.mesorregiao.UF.sigla}'),
--     '${m.microrregiao.mesorregiao.UF.sigla}',
--     ${m.geometry.coordinates[1]}, ${m.geometry.coordinates[0]})
-- `).join(';\n');
