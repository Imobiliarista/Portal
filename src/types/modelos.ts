// Modelos TypeScript que espelham o schema do D1
// Convenção: PascalCase para tipos/interfaces, português

// ========== Estados ==========
export interface Estado {
  id: number;
  nome: string;
  uf: string; // UF de 2 caracteres (ex: 'PR', 'SP')
  criado_em: string;
}

// ========== Cidades ==========
export interface Cidade {
  id: number;
  codigo_ibge?: number; // Código oficial do IBGE
  nome: string;
  estado_id: number;
  uf: string; // Cópia desnormalizada para conveniência
  latitude?: number;
  longitude?: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

// ========== Corretores/Usuários ==========
export interface Corretor {
  id: number;

  // Dados de identidade (imutáveis)
  nome_completo: string;
  sexo?: string;
  data_nascimento?: string; // YYYY-MM-DD
  nacionalidade?: string;
  cpf: string;
  creci: string;

  // Autenticação
  nome_usuario?: string; // Pode fazer login com nome_usuario OU cpf
  senha_hash: string;
  senha_salt?: string; // Salt para PBKDF2
  papel: 'corretor' | 'superadmin'; // papel/role do usuário

  // Dados de contato (editáveis)
  endereco_residencial?: string;
  telefone?: string;
  email: string;
  whatsapp?: string;

  // Status de aprovação
  status: 'pre-cadastro' | 'aprovado' | 'reprovado';
  motivo_reprovacao?: string;

  // Timestamps
  criado_em: string;
  atualizado_em: string;
}

// ========== Minisites ==========
export interface Minisite {
  id: number;
  corretor_id: number;
  slug: string; // Subdomínio do corretor (ex: 'marcos', 'joao-silva')
  offline: boolean; // true = site não acessível até aprovação
  criado_em: string;
  atualizado_em: string;
}

// ========== Planos ==========
export interface Plano {
  id: number;
  corretor_id: number;
  max_anuncios: number;
  max_fotos_por_anuncio: number;
  max_resolucao_upload_bytes: number; // Em bytes
  google_maps_api_key?: string; // Chave de API do Google Maps do corretor (opcional, premium)
  criado_em: string;
  atualizado_em: string;
}

// ========== Tipos de Negócio ==========
export interface TipoNegocio {
  id: number;
  nome: string; // 'Venda', 'Locação'
  slug: string; // 'venda', 'locacao'
  criado_em: string;
}

// ========== Categorias de Imóvel ==========
export interface CategoriaImovel {
  id: number;
  nome: string; // 'Residencial', 'Comercial', 'Corporativo', 'Industrial', 'Rural'
  slug: string;
  criado_em: string;
}

// ========== Tipos de Imóvel (por categoria) ==========
export interface TipoImovel {
  id: number;
  categoria_id: number;
  nome: string; // 'Apartamento', 'Casa', 'Terreno', etc.
  slug: string;
  criado_em: string;
}

// ========== Anúncios ==========
export interface Anuncio {
  id: number;
  corretor_id: number;
  titulo: string;
  descricao?: string;

  // Preço (um ou outro, dependendo do tipo de negócio)
  preco_venda?: number;
  preco_aluguel?: number;

  // Taxonomia
  tipo_negocio_id: number;
  categoria_imovel_id: number;
  tipo_imovel_id: number;

  // Localização
  cidade_id: number;
  bairro?: string;
  endereco_completo?: string;
  exibir_endereco_completo: boolean;

  // Especificações
  area_total?: number;
  area_util?: number;
  quartos?: number;
  banheiros?: number;
  vagas_garagem?: number;
  cozinhas?: number;
  lavanderias?: number;

  // Mídia
  fotos_json?: string; // JSON array de URLs de fotos
  video_youtube_id?: string; // ID limpo do vídeo (11 caracteres)
  tour_360_url?: string;

  // Status de publicação
  postar_na_rede: boolean; // true = visível no portal e na rede
  vendido_removido: boolean; // true = HTTP 410 para bots

  // URL amigável: /cidade/negocio/tipo/slug-id
  slug: string;

  // Timestamps
  criado_em: string;
  atualizado_em: string;
}

// ========== Pré-Cadastros ==========
export interface PreCadastro {
  id: number;
  nome: string;
  email: string;
  telefone: string;
  creci: string;

  // Aceite de termos (LGPD)
  aceite_termos_em?: string; // Timestamp do aceite
  versao_termos_aceita?: string; // Versão aceita (ex: '1.0.0')

  // Status de aprovação
  status: 'pendente' | 'aprovado' | 'reprovado';
  motivo_reprovacao?: string;

  // Timestamps
  criado_em: string;
  atualizado_em: string;
}

// ========== Cotas por Portal Externo ==========
export interface CotaPortal {
  id: number;
  corretor_id: number;
  portal_nome: string; // 'grupo-olx', 'imovelweb', 'chaves-na-mao', etc.
  quantidade_contratada?: number; // null = ilimitado
  ativo: boolean; // padrão: false (desligado)
  criado_em: string;
  atualizado_em: string;
}

// ========== Módulos Ativos ==========
export interface ModuloAtivo {
  id: number;
  nome: string;
  slug: string; // 'feed-grupo-olx', 'busca-ia', etc.
  descricao?: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

// ========== Tipos auxiliares/DTOs ==========

// Informações públicas do corretor (sem senha_hash)
export interface CorretorPerfil {
  id: number;
  nome_completo: string;
  cpf?: string; // Pode não retornar em contexto público
  creci: string;
  telefone?: string;
  email?: string;
  whatsapp?: string;
  minisite_slug?: string;
}

// Resposta de login
export interface RespostaLogin {
  sucesso: boolean;
  mensagem?: string;
  corretor_id?: number;
  email?: string;
  nome_completo?: string;
}

// Item de anúncio em listagem (com foto de capa apenas)
export interface AnuncioItem {
  id: number;
  titulo: string;
  preco?: number;
  cidade_nome: string;
  tipo_negocio_slug: string;
  tipo_imovel_slug: string;
  foto_capa?: string;
  quartos?: number;
  banheiros?: number;
  area_util?: number;
  slug: string;
}

// Anúncio completo com galeria
export interface AnuncioDetalhe extends Anuncio {
  corretor?: CorretorPerfil;
  tipo_negocio_slug?: string;
  tipo_imovel_slug?: string;
  categoria_slug?: string;
  cidade_nome?: string;
  fotos_array?: string[]; // Parsed from fotos_json
}

// ========== Autenticação (Lote 3) ==========

// Token de redefinição de senha
export interface ResetTokenSenha {
  id: number;
  corretor_id: number;
  token: string;
  expira_em: string; // ISO 8601 datetime
  usado: boolean;
  criado_em: string;
}

// Sessão de autenticação
export interface Sessao {
  id: number;
  corretor_id: number;
  session_id: string;
  ip_address?: string;
  user_agent?: string;
  expira_em: string; // ISO 8601 datetime
  criado_em: string;
}

// ========== 2FA - TOTP (Lote 9) ==========

// Configuração de 2FA TOTP para Superadmin
export interface DoislFaTotp {
  id: number;
  corretor_id: number;
  secret_key: string; // Chave secreta em base32
  backup_codes: string[]; // Array de 10 códigos de backup
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}
