# IMOBILIARISTA.NET — ARQUITETURA TÉCNICA OFICIAL
## Portal imobiliário + minisites de corretores em arquitetura JSON/R2

**Status:** Arquitetura proposta para remontagem do projeto atual  
**Versão:** 1.0  
**Data:** 2026-08-23  
**Documento normativo:** fonte de verdade para Codex/Code durante a remontagem do repositório.

---

# 1. OBJETIVO

O `imobiliarista.net` é uma plataforma imobiliária com:

```text
PORTAL PRINCIPAL
imobiliarista.net

MINISITES DE CORRETORES (E FUTURAMENTE ONEPAGES)
slug.imobiliarista.net

PAINEL DO CORRETOR
imobiliarista.net/painel

SUPERADMIN
imobiliarista.net/admin

DADOS PÚBLICOS
dados.imobiliarista.net

MÍDIAS
media.imobiliarista.net
```

`painel` e `admin` são caminhos sob o domínio raiz, não subdomínios — o
subdomínio wildcard (`*.imobiliarista.net`) fica reservado exclusivamente
para minisites de corretor e, futuramente, onepages. `dados.` e `media.`
continuam subdomínios com Custom Domain apontando direto para o R2, sem
passar pelo Worker — isso não muda.

A arquitetura deve ser simples, modular e orientada a objetos JSON publicados.

Princípio central:

```text
GitHub
→ software

Workers Static Assets
→ shell público + painel + admin

R2 PRIVATE
→ auth, corretores, drafts, estado privado

R2 DATA
→ cidades, imóveis, corretores, índices e exports públicos

R2 MEDIA
→ fotos, vídeos e mídia

Worker/API
→ operações privadas, publicação e módulos

Browser
→ navegação, filtros e renderização
```

---

# 2. DECISÃO ARQUITETURAL PRINCIPAL

O visitante público não deve depender de banco relacional ou consulta dinâmica de servidor.

Fluxo público:

```text
VISITANTE
   ↓
imobiliarista.net
   ↓
Workers Static Assets
   ↓
Browser
   ↓
JSON no R2
   ↓
renderização
```

Fluxo privado:

```text
CORRETOR / SUPERADMIN
   ↓
PAINEL
   ↓
Worker/API
   ↓
R2 PRIVATE
   ↓
PUBLICADOR
   ↓
R2 DATA / R2 MEDIA
```

---

# 3. TECNOLOGIAS ADOTADAS

## 3.1 GitHub

Responsável por:

```text
código
templates
frontend
Worker
schemas
scripts
testes
documentação
```

Não guardar no Git:

```text
CPF
CRECI sensível quando aplicável
senhas
hashes
tokens
documentos privados
dados pessoais privados
secrets
```

---

## 3.2 Workers Static Assets

Responsável por:

```text
portal SPA
minisite SPA
painel
SuperAdmin
CSS
JS
ícones
componentes estáticos
```

Configuração pública recomendada:

```toml
[assets]
directory = "frontend/public"
binding = "ASSETS"
not_found_handling = "single-page-application"
```

Evitar:

```toml
run_worker_first = ["/*"]
```

No novo desenho, `run_worker_first` deve ser restrito apenas às rotas privadas que realmente necessitem de Worker, como `/api/*`.

---

# 4. TECNOLOGIAS NÃO ADOTADAS NO NÚCLEO

A arquitetura v1 não utiliza:

```text
Cloudflare D1
Cloudflare KV
SQL
ORM
migrations SQL
SSR público
Pages Functions
Worker público para montar cada página
um projeto Cloudflare por corretor
um repositório por corretor
um bucket por corretor
um DNS record por corretor
iframe como roteamento
```

Qualquer inclusão futura exige justificativa técnica explícita.

---

# 5. DIVISÃO DE RESPONSABILIDADES

## GIT

```text
software
```

## R2 PRIVATE

```text
estado autoritativo
auth
corretor
draft de anúncio
configuração privada
```

## R2 DATA

```text
projeções públicas
cidades
cards
imóveis
corretores
índices
exports
```

## R2 MEDIA

```text
fotos
vídeos
tour 360
arquivos públicos
```

## WORKER

```text
login
sessão
CRUD privado
upload
publicação
módulos
pagamento
cron
jobs
```

## BROWSER

```text
roteamento
filtros
busca
ordenação local
renderização
lazy loading
```

---

# 6. MODELO EM TRÊS CAMADAS

Todo imóvel/corretor deve existir em:

## PRIVADO / AUTORITATIVO

```text
manifest
draft
auth
estado
```

## PUBLICADOR

```text
normaliza
valida
gera projeções
```

## PÚBLICO

```text
cards
imóvel completo
corretor
cidade
exports
```

Regra:

> R2 privado guarda estado. R2 público guarda projeções reconstruíveis.

---

# 7. UNIDADE PÚBLICA PRINCIPAL: CIDADE

A unidade principal do portal é a cidade.

Exemplos:

```text
/londrina
/curitiba
/sao-paulo
```

R2:

```text
cities/londrina/
cities/curitiba/
cities/sao-paulo/
```

O visitante só baixa dados da cidade acessada.

---

# 8. REGRA DE PARTICIONAMENTO POR CIDADE

Toda cidade começa como unidade isolada.

Exemplo:

```text
cities/londrina/listings.json
```

Se o conjunto continuar pequeno, permanece em um único arquivo.

Se ultrapassar o limite operacional configurado, divide-se internamente.

Regra inicial:

```text
cidade é sempre o primeiro particionamento
```

Nunca criar um JSON nacional gigante para listagem pública.

---

# 9. LIMITE DE SHARD

Para o Imobiliarista, usar regra híbrida.

Um shard fecha quando atingir primeiro:

```text
aprox. 1 MB comprimido
OU
300 cards
```

Valores são configuração de produto, não hardcode espalhado.

Constantes:

```text
MAX_CARDS_PER_SHARD = 300
TARGET_COMPRESSED_SIZE = 1 MB
```

---

# 10. CIDADE PEQUENA

Exemplo:

```text
Londrina
420 KB comprimidos
```

Pode usar:

```text
cities/londrina/
├── manifest.json
└── 001.json
```

Mesmo uma cidade pequena pode usar `001.json` desde o início para manter uma arquitetura única.

---

# 11. CIDADE GRANDE

Exemplo São Paulo:

```text
cities/sao-paulo/
├── manifest.json
├── 001.json
├── 002.json
├── 003.json
└── ...
```

O visitante não baixa todos de uma vez.

---

# 12. MANIFEST DA CIDADE

Exemplo:

```json
{
  "schemaVersion": 1,
  "city": {
    "slug": "sao-paulo",
    "name": "São Paulo",
    "uf": "SP"
  },
  "publicationVersion": 104,
  "totalListings": 5200,
  "pageSize": 300,
  "shards": [
    "001.json",
    "002.json",
    "003.json"
  ],
  "lastUpdated": "2026-08-23T00:00:00Z"
}
```

---

# 13. CARD DE IMÓVEL

Shard contém apenas projeção de card.

Exemplo:

```json
{
  "id": "listing_000123",
  "slug": "apartamento-centro-123",
  "title": "Apartamento no Centro",
  "purpose": "venda",
  "type": "apartamento",
  "price": 450000,
  "district": "Centro",
  "bedrooms": 3,
  "bathrooms": 2,
  "parkingSpaces": 2,
  "area": 95,
  "cover": "https://media.imobiliarista.net/...",
  "brokerSlug": "joao",
  "featured": false,
  "priority": 0
}
```

---

# 14. O QUE NÃO ENTRA NO SHARD

Não incluir:

```text
galeria completa
descrição longa
vídeos completos
tour 360 completo
documentação privada
dados administrativos
histórico de pagamento
dados de autenticação
configurações internas
```

---

# 15. IMÓVEL COMPLETO

Quando o visitante abre um card:

```text
/imovel/apartamento-centro-123
```

o Browser busca:

```text
listings/apartamento-centro-123.json
```

Exemplo:

```json
{
  "schemaVersion": 1,
  "publicationVersion": 20,
  "slug": "apartamento-centro-123",
  "status": "active",
  "title": "Apartamento no Centro",
  "description": "...",
  "purpose": "venda",
  "type": "apartamento",
  "price": 450000,
  "condominium": 650,
  "iptu": 2200,
  "location": {
    "city": "londrina",
    "district": "Centro",
    "latitude": -23.0,
    "longitude": -51.0
  },
  "features": {
    "bedrooms": 3,
    "bathrooms": 2,
    "parkingSpaces": 2,
    "area": 95
  },
  "gallery": [],
  "video": null,
  "tour360": null,
  "broker": {
    "slug": "joao",
    "name": "João"
  }
}
```

---

# 16. CORRETOR PÚBLICO

Minisite:

```text
joao.imobiliarista.net
```

usa:

```text
brokers/joao/profile.json
```

Exemplo:

```json
{
  "schemaVersion": 1,
  "slug": "joao",
  "status": "active",
  "name": "João Imóveis",
  "creciPublic": "12345-F",
  "phone": "...",
  "whatsapp": "...",
  "city": "londrina",
  "about": "...",
  "logo": "...",
  "cover": "...",
  "modules": {}
}
```

---

# 17. LISTAGENS DO CORRETOR

Se corretor tiver poucos imóveis:

```text
brokers/joao/listings.json
```

Se crescer:

```text
brokers/joao/listings/
├── manifest.json
├── 001.json
├── 002.json
└── ...
```

Mesma regra de particionamento pode ser reutilizada.

---

# 18. NAVEGAÇÃO PÚBLICA

Home:

```text
imobiliarista.net
```

Cidade:

```text
/londrina
```

Filtros:

```text
/londrina?venda&apartamento
```

ou rotas equivalentes definidas pelo frontend.

Detalhe:

```text
/imovel/{slug}
```

Minisite:

```text
{corretor}.imobiliarista.net
```

---

# 19. FLUXO DA CIDADE

```text
VISITANTE
   ↓
/londrina
   ↓
manifest.json
   ↓
001.json
   ↓
cards
   ↓
scroll/paginação
   ↓
002.json
```

---

# 20. FILTROS

O Browser filtra sobre cards já carregados.

Exemplos:

```text
venda/aluguel
tipo
bairro
faixa de preço
quartos
banheiros
vagas
área
mobiliado
pet friendly
```

Para cidades muito grandes, usar índice compacto.

---

# 21. INDEX COMPACTO DA CIDADE

Exemplo:

```text
cities/sao-paulo/index.json
```

Contém apenas dados de filtro e localização de shard.

```json
[
  {
    "id": "listing_000123",
    "slug": "apartamento-centro-123",
    "shard": 4,
    "purpose": "venda",
    "type": "apartamento",
    "district": "centro",
    "price": 450000,
    "bedrooms": 3,
    "area": 95
  }
]
```

---

# 22. BUSCA

Busca textual simples pode usar:

```text
cities/{city}/search.json
```

ou índice compacto.

Não baixar imóveis completos para pesquisar.

---

# 23. R2 PRIVATE — ESTRUTURA

```text
IMOB_PRIVATE/
│
├── brokers/
│   └── broker_000123/
│       ├── manifest.json
│       ├── profile-draft.json
│       └── settings.json
│
├── listings/
│   └── listing_000456/
│       ├── manifest.json
│       └── draft.json
│
├── auth/
│   └── user_000789.json
│
├── indexes/
│   ├── slugs/
│   ├── logins/
│   └── listings/
│
├── jobs/
│   └── ...
│
└── audit/
    └── opcional
```

---

# 24. R2 DATA — ESTRUTURA

```text
IMOB_DATA/
│
├── portal/
│   ├── cities.json
│   ├── taxonomy.json
│   └── modules.json
│
├── cities/
│   ├── londrina/
│   │   ├── manifest.json
│   │   ├── index.json
│   │   ├── 001.json
│   │   └── ...
│   └── sao-paulo/
│       └── ...
│
├── listings/
│   ├── apartamento-centro-123.json
│   └── ...
│
├── brokers/
│   ├── joao/
│   │   ├── profile.json
│   │   └── listings.json
│   └── ...
│
└── exports/
    └── ...
```

---

# 25. R2 MEDIA

```text
IMOB_MEDIA/
│
├── listings/
│   └── listing_000456/
│       ├── cover-v1.webp
│       ├── gallery/
│       └── videos/
│
└── brokers/
    └── broker_000123/
        ├── logo.webp
        └── cover.webp
```

---

# 26. AUTENTICAÇÃO

Sem D1.

R2 privado usa chaves determinísticas.

Não varrer objetos.

Login:

```text
POST /api/auth/login
→ resolve índice privado
→ carrega auth object
→ verifica passwordHash
→ cookie assinado
```

---

# 27. SENHAS

Nunca plaintext.

Usar password hashing adequado.

Não:

```text
SHA-256 puro
senha em JSON público
senha em log
senha no Git
```

---

# 28. SESSÃO

Sessão stateless assinada.

Cookie:

```text
HttpOnly
Secure
SameSite
expiração
```

Claims:

```text
userId
brokerId
slug
role
authVersion
iat
exp
```

---

# 29. CORRETOR — ESTADO PRIVADO

Manifest:

```json
{
  "schemaVersion": 1,
  "brokerId": "broker_000123",
  "userId": "user_000789",
  "slug": "joao",
  "status": "active",
  "plan": "premium",
  "profileKey": "brokers/broker_000123/profile-draft.json",
  "publicationVersion": 10
}
```

---

# 30. ANÚNCIO — ESTADO PRIVADO

Manifest:

```json
{
  "schemaVersion": 1,
  "listingId": "listing_000456",
  "brokerId": "broker_000123",
  "slug": "apartamento-centro-123",
  "city": "londrina",
  "status": "active",
  "draftKey": "listings/listing_000456/draft.json",
  "publicKey": "listings/apartamento-centro-123.json"
}
```

---

# 31. PUBLICADOR

Publicador é a ponte entre privado e público.

Fluxo:

```text
draft privado
↓
validar
↓
normalizar
↓
montar projeção pública
↓
PUT listing completo
↓
atualizar shard da cidade
↓
atualizar corretor
↓
atualizar manifest/index quando necessário
```

---

# 32. PUBLICAÇÃO INCREMENTAL

Uso normal:

```text
mudou descrição longa
→ listing completo

mudou capa/preço/quartos
→ listing completo
→ shard afetado

mudou cidade
→ remover shard antigo
→ adicionar no novo
→ atualizar manifests
```

---

# 33. REBUILD

Nunca reconstruir tudo por pequena alteração.

Scripts:

```text
rebuild-listing
rebuild-broker
rebuild-city
rebuild-all
```

---

# 34. REBUILD EM LOTE

Grandes rebuilds:

```text
rebuild nacional
→ dividir em lotes
→ checkpoint
→ retomável
→ idempotente
```

Referência inicial:

```text
100 shards por lote
```

Não executar milhares de PUTs numa única execução curta de Worker.

---

# 35. JOBS

Pode usar R2 PRIVATE para jobs determinísticos:

```text
jobs/cities/londrina.json
jobs/brokers/joao.json
```

ou Queue se houver justificativa operacional.

A arquitetura não exige Queue para leitura pública.

---

# 36. QUEUE — OPCIONAL

O projeto atual já usa Queue.

Pode ser preservada como mecanismo de fan-out de publicação se ajudar.

Uso correto:

```text
mutação privada
→ mensagem pequena
→ publicador
→ R2
```

Não usar Queue para cada visita.

---

# 37. CRON

Cron é manutenção.

Usos:

```text
rebuild leve
expirar estados temporais
sincronizar planos
limpeza
reconciliação
sitemap
exports
```

Não:

```text
reconstruir Brasil inteiro a cada poucos minutos
```

---

# 38. MÓDULOS

Reservar pasta:

```text
modules/
```

Funcionalidades opcionais/evolutivas ficam desacopladas.

---

# 39. REGRA DOS MÓDULOS

Permitido:

```text
MODULES
↓
BUSINESS
↓
CORE
↓
STORAGE
```

Proibido:

```text
CORE
↓
MODULE
```

Core nunca conhece módulo opcional.

---

# 40. MÓDULOS INICIAIS

Com base no projeto atual:

```text
agendamento-visita
busca-ia
busca-salva-email
calculadora-financiamento
comparacao-anuncios
feed-portais
publicacoes
pwa
tour-360
video-youtube
financial
plans
```

---

# 41. MÓDULO AGENDAMENTO

```text
modules/appointments/
├── index.js
├── service.js
├── validation.js
├── routes.js
└── README.md
```

---

# 42. MÓDULO BUSCA IA

```text
modules/ai-search/
├── index.js
├── parser.js
├── service.js
├── routes.js
└── README.md
```

IA não deve virar dependência da busca básica.

---

# 43. MÓDULO BUSCA SALVA

```text
modules/saved-search/
├── index.js
├── service.js
├── notifications.js
└── README.md
```

---

# 44. CALCULADORA FINANCEIRA

Preferir client-side sempre que possível.

```text
modules/financing-calculator/
├── index.js
├── config.js
└── README.md
```

Se puro frontend, não criar rota Worker desnecessária.

---

# 45. COMPARAÇÃO DE ANÚNCIOS

Client-side.

Browser compara JSONs já carregados.

Não precisa Worker.

---

# 46. FEED PARA PORTAIS EXTERNOS

```text
modules/feeds/
├── index.js
├── registry.js
├── formatters/
│   ├── olx.js
│   ├── zap.js
│   └── ...
├── generator.js
└── README.md
```

Exports ficam no R2.

---

# 47. PUBLICAÇÕES / BLOG

Pode consumir feed externo no Browser, mesma filosofia do ACTS.

Config no perfil público do corretor:

```json
{
  "publications": {
    "enabled": true,
    "feedUrl": "..."
  }
}
```

---

# 48. PWA

Módulo isolado.

Não tornar PWA dependência do portal.

---

# 49. TOUR 360

Campo opcional na projeção pública do imóvel.

Se inexistente, componente não renderiza.

---

# 50. VÍDEO YOUTUBE

Mesmo padrão:

```json
{
  "video": {
    "provider": "youtube",
    "id": "..."
  }
}
```

---

# 51. FINANCEIRO

```text
modules/financial/
├── index.js
├── checkout.js
├── payments.js
├── provider.js
├── webhook.js
└── README.md
```

Transações continuam no Worker.

---

# 52. PLANOS

```text
modules/plans/
├── index.js
├── catalog.js
├── eligibility.js
├── features.js
└── README.md
```

Não espalhar checks de plano por toda base.

---

# 53. SUPERADMIN

Funções:

```text
criar corretor
aprovar
suspender
reativar
editar estado administrativo
resetar senha
gerenciar planos
gerenciar módulos
republicar corretor
republicar imóvel
rebuild cidade
rebuild global
```

---

# 54. PAINEL DO CORRETOR

Áreas:

```text
visão geral
perfil
imóveis
mídia
publicações
plano
financeiro
módulos
conta
```

---

# 55. MULTITENANCY

Backend resolve corretor pela sessão.

Nunca aceitar:

```json
{
  "brokerSlug": "outro-corretor"
}
```

como autoridade.

---

# 56. UPLOAD

Browser nunca recebe credencial R2.

Fluxo:

```text
Browser
→ API
→ valida sessão
→ valida arquivo
→ R2 MEDIA
```

---

# 57. MÍDIA

Validar:

```text
MIME real
tamanho
extensão permitida
dimensões quando aplicável
path
nome/chave
```

Preferir WebP/AVIF quando fluxo permitir.

---

# 58. PUBLICAÇÃO DE MÍDIA

JSON só guarda URLs/chaves.

Nunca base64 dentro dos JSONs.

---

# 59. CACHE

## Static Assets

Cache automático da Cloudflare.

## JSON

Cache Rule explícita no Custom Domain de R2.

## Mídia

TTL longo para objetos versionados.

---

# 60. ESTRATÉGIA DE CACHE DE JSON

Sugestão:

```text
city manifest → TTL curto
city shard → TTL curto/moderado
listing completo → TTL curto/moderado
broker profile → TTL curto/moderado
```

Após atualização:

```text
PUT
→ purge quando necessário
```

---

# 61. VERSIONAMENTO

Todo JSON relevante:

```json
{
  "schemaVersion": 1,
  "publicationVersion": 10,
  "publishedAt": "..."
}
```

---

# 62. EXPORTAÇÃO

```text
exports/brokers/{slug}.json
exports/listings/{slug}.json
exports/cities/{city}.json
```

Contratos versionados.

---

# 63. SITEMAP

Gerado a partir das projeções públicas.

Não consultar D1.

Pode usar:

```text
portal/cities.json
city manifests
listing manifests
```

---

# 64. REMOÇÃO / VENDIDO

Anúncio removido ou vendido:

```text
estado privado atualizado
↓
publicador
↓
remove card da cidade
↓
atualiza corretor
↓
listing público vira tombstone ou é removido
```

Política HTTP/SEO pode preservar 410 conforme regra do produto.

---

# 65. TAXONOMIA

Taxonomia pública:

```text
portal/taxonomy.json
```

Exemplo:

```text
tipos
finalidades
características
faixas
```

Frontend usa sem API.

---

# 66. CIDADES

Catálogo:

```text
portal/cities.json
```

Pode conter:

```text
slug
nome
UF
quantidade de anúncios
```

---

# 67. ESTRUTURA OFICIAL DO REPOSITÓRIO

```text
IMOBILIARISTA/
│
├── core/
│   ├── app.js
│   ├── router.js
│   ├── auth.js
│   ├── session.js
│   ├── tenant.js
│   ├── permissions.js
│   ├── validation.js
│   ├── security.js
│   ├── response.js
│   └── logger.js
│
├── storage/
│   ├── keys.js
│   ├── private.js
│   ├── public.js
│   ├── media.js
│   ├── indexes.js
│   └── cache.js
│
├── business/
│   ├── brokers.js
│   ├── listings.js
│   ├── cities.js
│   ├── taxonomy.js
│   ├── cards.js
│   ├── publishing.js
│   ├── media.js
│   └── exports.js
│
├── modules/
│   ├── appointments/
│   │   ├── index.js
│   │   ├── service.js
│   │   ├── validation.js
│   │   ├── routes.js
│   │   └── README.md
│   │
│   ├── ai-search/
│   │   ├── index.js
│   │   ├── parser.js
│   │   ├── service.js
│   │   └── README.md
│   │
│   ├── saved-search/
│   │   ├── index.js
│   │   ├── service.js
│   │   └── README.md
│   │
│   ├── financing-calculator/
│   │   ├── index.js
│   │   └── README.md
│   │
│   ├── comparison/
│   │   ├── index.js
│   │   └── README.md
│   │
│   ├── feeds/
│   │   ├── index.js
│   │   ├── registry.js
│   │   ├── generator.js
│   │   ├── formatters/
│   │   └── README.md
│   │
│   ├── publications/
│   │   ├── index.js
│   │   ├── config.js
│   │   └── README.md
│   │
│   ├── pwa/
│   │   ├── index.js
│   │   ├── manifest.js
│   │   ├── service-worker.js
│   │   └── README.md
│   │
│   ├── tour-360/
│   │   ├── index.js
│   │   └── README.md
│   │
│   ├── video-youtube/
│   │   ├── index.js
│   │   └── README.md
│   │
│   ├── financial/
│   │   ├── index.js
│   │   ├── checkout.js
│   │   ├── payments.js
│   │   ├── provider.js
│   │   ├── webhook.js
│   │   └── README.md
│   │
│   ├── plans/
│   │   ├── index.js
│   │   ├── catalog.js
│   │   ├── eligibility.js
│   │   └── README.md
│   │
│   └── future/
│       └── .gitkeep
│
├── worker/
│   ├── index.js
│   ├── api.js
│   ├── auth.js
│   ├── admin.js
│   ├── uploads.js
│   └── cron.js
│
├── frontend/
│   ├── portal/
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── router.js
│   │   ├── data.js
│   │   ├── filters.js
│   │   ├── render.js
│   │   ├── components/
│   │   └── styles/
│   │
│   ├── minisite/
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── data.js
│   │   ├── render.js
│   │   ├── components/
│   │   └── styles/
│   │
│   ├── painel/
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── auth.js
│   │   ├── forms.js
│   │   ├── media.js
│   │   ├── modules/
│   │   └── styles/
│   │
│   └── admin/
│       ├── index.html
│       ├── app.js
│       ├── brokers.js
│       ├── listings.js
│       ├── publishing.js
│       ├── modules/
│       └── styles/
│
├── schemas/
│   ├── broker.schema.json
│   ├── broker-public.schema.json
│   ├── listing-draft.schema.json
│   ├── listing-public.schema.json
│   ├── city-manifest.schema.json
│   ├── city-index.schema.json
│   ├── city-shard.schema.json
│   ├── taxonomy.schema.json
│   ├── export.schema.json
│   └── modules/
│
├── scripts/
│   ├── rebuild-listing.js
│   ├── rebuild-broker.js
│   ├── rebuild-city.js
│   ├── rebuild-all.js
│   ├── validate-json.js
│   └── verify-storage.js
│
├── tests/
│   ├── core/
│   ├── storage/
│   ├── business/
│   ├── modules/
│   ├── publishing/
│   ├── security/
│   └── frontend/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATA-MODEL.md
│   ├── MODULES.md
│   ├── OPERATIONS.md
│   └── CHANGELOG.md
│
├── wrangler.toml
├── package.json
└── README.md
```

---

# 68. CORE

Core contém somente:

```text
auth
session
permissions
validation
security
routing
response
logging
```

Não conhece:

```text
PWA
YouTube
IA
financeiro
feed
planos
```

---

# 69. STORAGE

Abstrai bindings R2.

Funções:

```text
getPrivate
putPrivate
deletePrivate
getPublic
putPublic
deletePublic
putMedia
deleteMedia
buildKey
```

Não espalhar `env.BUCKET.get()` pelo projeto inteiro.

---

# 70. BUSINESS

Domínio estrutural:

```text
brokers
listings
cities
taxonomy
cards
publishing
media
exports
```

---

# 71. WORKER

Entry point deve ser pequeno.

Fluxo:

```text
request
→ router
→ auth
→ handler
→ business/module
→ storage
→ response
```

---

# 72. API PRIVADA

Rotas sugeridas:

```text
POST /api/auth/login
POST /api/auth/logout

GET  /api/me
GET  /api/me/profile
PUT  /api/me/profile

GET  /api/me/listings
POST /api/me/listings
GET  /api/me/listings/:id
PUT  /api/me/listings/:id
DELETE /api/me/listings/:id

POST /api/me/media
DELETE /api/me/media/:id

POST /api/admin/brokers
GET  /api/admin/brokers/:id
PUT  /api/admin/brokers/:id
POST /api/admin/brokers/:id/approve
POST /api/admin/brokers/:id/suspend
POST /api/admin/brokers/:id/activate
POST /api/admin/brokers/:id/publish

POST /api/admin/rebuild/listing/:id
POST /api/admin/rebuild/broker/:id
POST /api/admin/rebuild/city/:city
```

---

# 73. PUBLIC ROUTING

Não usar Worker para:

```text
/
/londrina
/imovel/*
*.imobiliarista.net
```

quando o shell SPA puder atender diretamente.

Browser busca R2 depois.

---

# 74. WILDCARD

DNS:

```text
*.imobiliarista.net
```

Minisite identifica slug pelo hostname.

```javascript
const slug = location.hostname.split('.')[0];
```

Busca:

```text
brokers/{slug}/profile.json
```

---

# 75. SITE INEXISTENTE

```text
GET broker profile
→ 404
→ minisite não encontrado
```

Nunca mostrar corretor padrão.

---

# 76. CORRETOR SUSPENSO

Publicação mínima:

```json
{
  "schemaVersion": 1,
  "slug": "joao",
  "status": "suspended"
}
```

---

# 77. CIDADE SEM ANÚNCIOS

Manifest:

```json
{
  "schemaVersion": 1,
  "totalListings": 0,
  "shards": []
}
```

Frontend mostra estado vazio.

---

# 78. INPUT

Backend usa allowlist.

Não persistir body cru.

Validar:

```text
texto
números
preço
coordenadas
URLs
slug
fotos
vídeo
tour
campos de módulo
```

---

# 79. SEGURANÇA

Nunca logar:

```text
senha
passwordHash
cookie
token
CPF integral
secrets
```

---

# 80. CORS

R2 DATA/MEDIA:

```text
GET
HEAD
```

Escrita somente via Worker.

---

# 81. HEADERS

Aplicar:

```text
Content-Security-Policy
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
HSTS
```

---

# 82. TESTES PÚBLICOS

```text
home
cidade
manifest
shard
paginação
filtros
imóvel completo
minisite
404
suspended
cache
```

---

# 83. TESTES PRIVADOS

```text
login
sessão
tenant isolation
CRUD de imóvel
upload
publicação
aprovação
suspensão
```

---

# 84. TESTES DE ESCALA

```text
cidade 1 anúncio
cidade 300 anúncios
cidade 301 anúncios
cidade >1MB
cidade 5.000 anúncios
rebuild em lote
falha e retomada
```

---

# 85. MIGRAÇÃO DO PROJETO ATUAL

O projeto atual possui:

```text
src/db/*
migrations/*
D1 binding
jobs JSON
Queue
R2 DATA
R2 MEDIA
módulos
frontend SPA
```

A remontagem deve preservar lógica útil, mas remover dependência arquitetural de D1.

---

# 86. O QUE PRESERVAR DO PROJETO ATUAL

Preservar conceitualmente:

```text
geração de JSON
R2 público
R2 mídia
SPA
módulos
Queue quando útil
sanitização
slug
sessão
feeds externos
PWA
tour 360
vídeo
Asaas
testes relevantes
```

---

# 87. O QUE REMOVER OU SUBSTITUIR

Remover/substituir:

```text
src/db/*
migrations/*
binding D1
queries SQL
backup mensal D1
run_worker_first global
JSON de cidade montado por SELECT
cache/status backend público dependente de Worker
```

---

# 88. NOVO FLUXO DE PUBLICAÇÃO

ANTES:

```text
D1
→ SELECT
→ job
→ JSON
→ R2
```

DEPOIS:

```text
R2 PRIVATE
→ draft/manifest
→ publicador
→ JSON
→ R2 DATA
```

---

# 89. NOVO FLUXO PÚBLICO

ANTES:

```text
visitante
→ Worker
→ status/backend
→ R2
→ shell
```

DEPOIS:

```text
visitante
→ Static Assets
→ Browser
→ R2
```

---

# 90. ORDEM DE IMPLEMENTAÇÃO

## ETAPA 1 — Fundação

```text
nova estrutura
core
storage
schemas
Static Assets
R2 bindings
```

## ETAPA 2 — Público

```text
portal SPA
cidade
manifest
shards
imóvel completo
minisite
```

## ETAPA 3 — R2 privado

```text
brokers
listings
auth
indexes
```

## ETAPA 4 — Auth

```text
hash
login
sessão
permissions
```

## ETAPA 5 — Painel

```text
perfil
CRUD imóvel
mídia
```

## ETAPA 6 — Publicador

```text
listing
card
cidade
corretor
```

## ETAPA 7 — Escala

```text
1MB/300 cards
shards
indexes
rebuild em lote
```

## ETAPA 8 — SuperAdmin

```text
aprovação
suspensão
planos
rebuild
```

## ETAPA 9 — Módulos existentes

```text
PWA
YouTube
Tour 360
Publicações
Comparação
Calculadora
Agendamento
Feed externo
Busca salva
IA
```

## ETAPA 10 — Financeiro

```text
plans
Asaas
webhook
```

## ETAPA 11 — Hardening

```text
headers
CORS
cache
tests
observabilidade
docs
```

---

# 91. IMPLEMENTAÇÃO PELO CODEX

Trabalhar em lotes.

Cada lote:

```text
implementa apenas escopo
executa testes
lista arquivos
lista decisões
lista pendências
não inicia lote seguinte
```

---

# 92. PRs

Preferir:

```text
1 lote
→ 1 branch
→ 1 PR coerente
```

Não misturar múltiplos módulos e remontagem estrutural no mesmo PR.

---

# 93. REGRA DE NÃO-REGRESSÃO

Codex não deve reintroduzir:

```text
D1
KV
SQL
migrations
Worker público em toda navegação
um JSON nacional enorme
um projeto por corretor
um HTML por corretor
credencial R2 no browser
```

---

# 94. REGRA DE SIMPLICIDADE

Antes de adicionar tecnologia:

```text
pode ser Static Asset?
pode ser JSON?
pode ser R2?
pode ser Browser?
pode ser módulo pequeno?
pode ser Worker privado curto?
```

Se sim, não adicionar nova peça.

---

# 95. CONSUMO E ESCALA

Uso normal:

```text
visitas
→ Static Assets + R2/cache

edições
→ Worker + poucos PUTs

rebuild
→ lote
```

A arquitetura deve otimizar principalmente o tráfego público.

---

# 96. REFERÊNCIA CLOUDFLARE — STATIC ASSETS

Em 2026-08-23, Cloudflare documenta:

```text
requests resolvidas como Static Assets
→ gratuitas e ilimitadas
```

Requests que invocam Worker script seguem pricing/limites Workers.

Fonte:

`https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/`

---

# 97. REFERÊNCIA CLOUDFLARE — SPA

`not_found_handling = "single-page-application"` permite que navegações sem arquivo correspondente recebam `index.html`.

Com compatibility date moderna, navegações podem preferir asset serving sem invocar Worker.

Fonte:

`https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/`

---

# 98. REFERÊNCIA CLOUDFLARE — R2

Free tier Standard em 2026-08-23:

```text
10 GB-month
1M Class A/mês
10M Class B/mês
egress gratuito
```

Fonte:

`https://developers.cloudflare.com/r2/pricing/`

---

# 99. RESULTADO ESPERADO

Portal:

```text
leve
modular
sem D1
sem SQL
sem migrations
asset-first
JSON/R2
browser-first
```

Escala:

```text
cidade pequena
→ 1 shard

cidade média
→ poucos shards

cidade grande
→ vários shards

mesmo algoritmo
```

---

# 100. RESUMO EXECUTIVO

```text
                             GITHUB
                               │
                    código / templates / docs
                               │
                               ▼
                    WORKERS STATIC ASSETS
                               │
                 ┌─────────────┴─────────────┐
                 ▼                           ▼
        imobiliarista.net          *.imobiliarista.net
                 │                           │
                 └─────────────┬─────────────┘
                               ▼
                            BROWSER
                       ┌───────┴───────┐
                       ▼               ▼
                    R2 DATA         R2 MEDIA


CORRETOR ──────────────┐
                       ▼
                     PAINEL
                       │
SUPERADMIN ─────────────┤
                       ▼
                     WORKER
                       │
               ┌───────┼────────┐
               ▼       ▼        ▼
          R2 PRIVATE  DATA     MEDIA
```

---

# 101. REGRA FINAL PARA O CODEX

> Não recriar a complexidade que esta arquitetura foi criada para eliminar.

O sistema deve usar:

```text
cidade como unidade pública
shards apenas quando necessário
máximo inicial 300 cards ou ~1MB comprimido
imóvel completo separado
corretor separado
R2 privado como estado
R2 público como projeção
R2 mídia para arquivos
Worker somente privado/transacional
Static Assets no público
Browser para filtros/renderização
módulos desacoplados
```

Qualquer proposta que transforme navegação pública comum em consulta dinâmica de backend deve ser considerada fora da arquitetura até decisão explícita.
