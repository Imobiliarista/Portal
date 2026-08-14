# Portal Imobiliário (Multisites)

Rede de portais imobiliários com portal central de busca, minisites
individuais por corretor e compartilhamento de anúncios entre domínios —
em arquitetura 100% Cloudflare (Workers + D1 + R2).

> A especificação completa do projeto (escopo, arquitetura, modelo de
> dados, regras de negócio e convenções) está em [`project.md`](./project.md).
> Qualquer dúvida sobre uma decisão de arquitetura deve ser respondida por
> esse documento antes de qualquer outra fonte.

## Requisitos

- [Node.js](https://nodejs.org/) 20+
- Conta na [Cloudflare](https://dash.cloudflare.com/) com acesso a Workers, D1 e R2
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (instalado via `devDependencies`, sem necessidade de instalação global)

## Instalação

```bash
npm install
```

## Configuração

1. Autentique o Wrangler na sua conta Cloudflare:

   ```bash
   npx wrangler login
   ```

2. Os recursos remotos (D1 `imob-bd`, R2 `imob-dados` + `imob-midias` e a
   Queue `imob-queue`) já existem na conta Cloudflare e estão
   referenciados no `wrangler.toml`. Caso precise recriá-los do zero (ex.:
   outra conta/ambiente):

   ```bash
   npx wrangler d1 create imob-bd
   npx wrangler r2 bucket create imob-dados
   npx wrangler r2 bucket create imob-midias
   npx wrangler queues create imob-queue
   ```

3. Copie o `database_id` retornado pelo `wrangler d1 create` para o campo
   `database_id` do `wrangler.toml`.

4. Copie `.env.example` para `.dev.vars` (arquivo lido pelo Wrangler em
   desenvolvimento local, nunca commitado) e preencha os valores:

   ```bash
   cp .env.example .dev.vars
   ```

   Em produção, cada variável deve ser configurada como Secret:

   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```

## Rodando localmente

```bash
npm run dev
```

Isso sobe o Worker localmente via `wrangler dev`, com bindings de D1/R2/Queue
emulados.

## Build do CSS (Tailwind)

```bash
npm run watch:css   # observa mudanças durante o desenvolvimento
npm run build:css   # gera o CSS final minificado
```

`public/assets/css/tailwind.css` é gerado a partir de `styles/input.css` e
**não é commitado** (ver `.gitignore`) — os arquivos HTML em `public/`
referenciam esse arquivo localmente, não mais o CDN do Tailwind. `npm run
deploy` já roda `build:css` automaticamente antes do `wrangler deploy` via
hook `predeploy`; ao publicar manualmente sem passar por `npm run deploy`
(ex.: `wrangler deploy` direto), rode `npm run build:css` antes — sem isso
o site sobe sem nenhum estilo.

## Outros comandos úteis

```bash
npm run typecheck   # checagem de tipos (tsc --noEmit)
npm run lint        # ESLint
npm run format      # Prettier
npm run deploy      # publica o Worker (wrangler deploy)
```

## Estrutura do projeto

A árvore de pastas completa e o significado de cada uma estão definidos em
[`project.md`, seção 4.2](./project.md#42-estrutura-de-pastas--decisão-fechada).
O progresso da implementação, lote a lote, é acompanhado na
[seção 10 (Roadmap)](./project.md#10-roadmap-de-implementação-lotes).
