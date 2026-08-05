-- 0004_modulos.sql — tabela modulos_ativos com módulos opcionais do sistema
-- Inspirado em plugins do WordPress, adaptado à realidade do Cloudflare Workers
-- Cada módulo pode ser ligado/desligado pelo Superadmin sem redeploy

CREATE TABLE IF NOT EXISTS modulos_ativos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN DEFAULT 0, -- padrão: desligado
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Inserção dos 9 módulos opcionais (desligados por padrão)
INSERT INTO modulos_ativos (nome, slug, descricao, ativo) VALUES
  ('Feed Grupo OLX', 'feed-grupo-olx', 'Exporta anúncios em formato VRSync para OLX, ZAP e VivaReal', 0),
  ('Feed Portais Independentes', 'feed-portais-independentes', 'Exporta anúncios para portais como ImóvelWeb e Chaves na Mão', 0),
  ('Busca por IA', 'busca-ia', 'Assistente de busca em linguagem natural usando Cloudflare Workers AI (portal apenas)', 0),
  ('Vídeo YouTube', 'video-youtube', 'Suporte a embed de vídeos do YouTube nos anúncios', 0),
  ('Tour Virtual 360°', 'tour-360', 'Suporte a links de tour virtual (Matterport, etc.)', 0),
  ('Busca Salva e Email', 'busca-salva-email', 'Permite visitantes salvar buscas e receber alertas por e-mail', 0),
  ('Agendamento de Visita', 'agendamento-visita', 'Sistema de agendamento de visitas ao imóvel', 0),
  ('Comparação de Anúncios', 'comparacao-anuncios', 'Permite comparação lado a lado de 2-3 imóveis', 0),
  ('Calculadora de Financiamento', 'calculadora-financiamento', 'Widget de cálculo de financiamento no anúncio', 0);

-- Índice para busca rápida por slug
CREATE INDEX IF NOT EXISTS idx_modulos_ativos_slug ON modulos_ativos(slug);
CREATE INDEX IF NOT EXISTS idx_modulos_ativos_ativo ON modulos_ativos(ativo);
