# Portal Imobiliarista — Rede de Portais de Imóveis

Rede de portais imobiliários multisites com portal central de busca e minisites individuais para corretores. Arquitetura 100% Cloudflare (Workers + D1 + R2) otimizada para operação dentro (ou perto) do free tier.

## 🎯 Visão Geral

- **Domínio principal:** imobiliarista.net
- **Minisites:** `{nome}.imobiliarista.net`
- **Tecnologia:** Cloudflare Workers + D1 + R2 + Queues
- **Frontend:** HTML + JS + Tailwind CSS
- **Banco de dados:** Cloudflare D1 (SQLite)
- **Armazenamento:** Cloudflare R2
- **Mapas:** OpenStreetMap + Leaflet.js (padrão gratuito)

## ⚡ Quick Start

### Pré-requisitos

- Node.js 18+ e npm
- Conta Cloudflare com Workers habilitado
- Git

### Instalação local

```bash
# Clone o repositório
git clone https://github.com/Imobiliarista/Portal.git
cd Portal

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite .env com seus valores reais
```

### Desenvolvimento

```bash
# Inicie o servidor de desenvolvimento local
npm run dev

# Acesse em http://localhost:8787
```

### Build e Deploy

```bash
# Faça build do projeto
npm run build

# Deploy para Cloudflare (requer autenticação)
npm run deploy
```

## 📁 Estrutura de Diretórios

```
Portal/
├── src/                          # Código-fonte (TypeScript)
│   ├── index.ts                    # Entry point do Worker
│   ├── middleware/                 # Middlewares (www-redirect, bot-detect)
│   ├── routes/                     # Rotas principais
│   ├── modulos/                    # Funcionalidades opcionais
│   ├── db/                         # Queries do banco de dados
│   ├── jobs/                       # Processamento em lote
│   ├── lib/                        # Utilitários compartilhados
│   └── types/                      # Definições TypeScript
│
├── public/                       # Arquivos estáticos (SPA)
│   ├── index.html
│   ├── painel/index.html
│   ├── manifest.json
│   ├── sw.js
│   └── assets/
│
├── styles/                       # CSS (Tailwind)
│   └── input.css
│
├── migrations/                   # Migrations do D1
│
├── wrangler.toml                 # Configuração do Cloudflare
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── .gitignore
├── .env.example
└── README.md
```

## 🔧 Configuração

### Wrangler.toml

O arquivo `wrangler.toml` contém as configurações do Cloudflare Workers:
- Bindings D1 (banco de dados)
- Bindings R2 (armazenamento)
- Rotas do Worker (domínio raiz + wildcard)
- Filas de processamento

Complete os valores vazios com seu account_id e database_id do Cloudflare.

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com base em `.env.example`. As variáveis necessárias incluem:
- `CF_ACCOUNT_ID` — ID da sua conta Cloudflare
- `CF_API_TOKEN` — Token de API do Cloudflare
- `DB_ID` — ID do banco D1
- `RESEND_API_KEY` — API key do Resend (e-mails transacionais)

## 📖 Documentação

Consulte o arquivo `project.md` na raiz do repositório para:
- Visão técnica completa do projeto
- Decisões de arquitetura
- Roadmap de implementação
- Convenções de código
- Especificações de funcionalidades

## 🚀 Scripts Disponíveis

```bash
npm run build          # Build da aplicação (TS + CSS)
npm run build:ts       # Build apenas do TypeScript
npm run build:css      # Build apenas do Tailwind CSS
npm run dev            # Servidor de desenvolvimento local
npm run deploy         # Deploy para Cloudflare
npm run lint           # Lint do código (ESLint)
npm run format         # Formatação automática (Prettier)
npm run type-check     # Verificação de tipos
```

## 🌐 Roteamento

O Worker roteia requisições com base no hostname:

- **`imobiliarista.net/`** — Portal público (busca de imóveis por cidade)
- **`{slug}.imobiliarista.net/`** — Minisite de um corretor específico
- **Requisições com `www.`** — Redirecionadas para versão sem `www.` (301)

## 🎨 Stack Técnica

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + JavaScript + Tailwind CSS |
| Backend | Cloudflare Workers |
| Banco de Dados | Cloudflare D1 |
| Armazenamento | Cloudflare R2 |
| Fila/Lote | Cloudflare Queues |
| CSS | Tailwind CSS + PostCSS |
| Tipagem | TypeScript |

## 📋 Convenções de Código

- **Idioma:** Português (Brasil)
- **Arquivos/pastas:** `kebab-case` (ex: `www-redirect.ts`)
- **Funções/variáveis:** `camelCase` em português (ex: `criarAnuncio()`)
- **Tipos/Interfaces:** `PascalCase` em português (ex: `AnuncioItem`)
- **Commits:** Conventional Commits (ex: `feat: adiciona remoção de www`)
- **Lint:** ESLint + Prettier
- **Limite por arquivo:** ~500 linhas

## 🔐 Segurança

- Senhas com PBKDF2 + salt (Web Crypto API nativa)
- Cookies HttpOnly + Secure + SameSite=Strict
- Validação de CPF (dígito verificador)
- Proteção contra força bruta no login
- Rate limiting para APIs públicas
- Cloudflare Turnstile no pré-cadastro (captcha gratuito)

## 📊 Limites do Free Tier (Cloudflare)

| Serviço | Limite |
|---|---|
| Workers | 100.000 requisições/dia |
| D1 | 5.000.000 leitura/dia, 100.000 escrita/dia |
| R2 | 10.000.000 leituras/mês, zero egress |

Otimizações para permanecer no free tier:
- JSON servido diretamente do R2 (bypass Worker)
- Geração de JSONs apenas em mudanças de dados
- Fila de alterações em lote
- Cache agressivo (Edge + Service Worker)

## 🤝 Como Contribuir

1. Crie uma branch a partir de `main`: `git checkout -b minha-feature`
2. Faça commit com Conventional Commits: `git commit -m "feat: descrição da feature"`
3. Push para a branch: `git push origin minha-feature`
4. Abra um Pull Request

## 📝 Licença

Proprietário — Imobiliarista

## 🆘 Suporte

Para dúvidas ou issues técnicas, consulte a seção de Issues no repositório ou refira-se à documentação técnica em `project.md`.
