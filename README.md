# imobiliarista.net

Portal imobiliário + minisites de corretores, em arquitetura JSON/R2 (sem
D1/KV/SQL/Durable Objects). Fonte normativa:
[`IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md`](./IMOBILIARISTA_ARQUITETURA_TECNICA_OFICIAL_JSON_R2.md).

Documentação de apoio em [`docs/`](./docs/):

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/DATA-MODEL.md`](./docs/DATA-MODEL.md)
- [`docs/MODULES.md`](./docs/MODULES.md)
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) — inclui o passo a passo de
  publicação dos read models globais do portal (ver abaixo)
- [`docs/CHANGELOG.md`](./docs/CHANGELOG.md)

## Arquitetura em uma frase

```text
Visitante → Static Assets / R2 DATA (Custom Domain) → HTML/CSS/JS/JSON públicos
Corretor/SuperAdmin/Sistema → /api/* → Worker → IMOB_PRIVATE → publicador → IMOB_DATA
```

O visitante nunca consulta `IMOB_PRIVATE` nem passa pelo Worker para
navegar (§73/§89) — só as rotas `/api/*` privadas passam pelo Worker.
Nenhum D1, KV, SQL ou Durable Object em nenhuma camada.

## Desenvolvimento

```bash
npm install
npm test                  # suíte core/ + storage/ + business/ + frontend/ + workflows/config
npm run validate:schemas  # valida schemas/*.schema.json
npm run validate:r2-cors  # valida config/r2/imob-data-cors.json
npm run dev                # wrangler dev
```

Implementação em lotes, um PR por etapa (§90-§92 do documento normativo).

## Estado operacional (código validado ≠ produção ativada)

Todo o código deste repositório passa em `npm test` (suíte completa) e
está pronto para publicação — isso **não** significa que a produção já
está servindo dados reais. Duas coisas distintas:

- **Código validado**: os read models públicos globais do portal
  (`portal/cities.json`/`taxonomy.json`/`modules.json`) têm gerador,
  adapter, executor, workflow protegido e testes completos (ver
  "Publicar os read models" abaixo) — tudo isso já existe no repositório e
  passa localmente sem nenhuma credencial.
- **Produção ativada**: esses objetos só existem de fato em
  `https://dados.imobiliarista.net/` depois que alguém com acesso ao
  GitHub e ao painel Cloudflare rodar o workflow de publicação (modo
  `publish`) e configurar o CORS do bucket — nenhuma destas ações foi
  executada automaticamente por nenhum código deste repositório.

As pendências bloqueantes de infraestrutura (criar os 3 buckets R2,
provisionar `SESSION_SECRET`, catálogo IBGE completo, etc.) continuam
documentadas em `docs/OPERATIONS.md` e não são afetadas por isto.

## Publicar os read models globais do portal (primeira vez / após mudança fora do painel)

1. GitHub → Actions → **"Validar e publicar read models no R2"** →
   Run workflow, branch `main`, modo `validate` — sem credenciais, roda a
   suíte inteira + schemas + CORS + o adapter contra fixtures locais.
2. Configurar (uma vez) o Environment `production-r2` (secret
   `CLOUDFLARE_API_TOKEN`, variable `CLOUDFLARE_ACCOUNT_ID`, reviewer) e
   aplicar `config/r2/imob-data-cors.json` no bucket `imob-data` do painel
   Cloudflare — passo a passo completo em `docs/OPERATIONS.md`.
3. Run workflow de novo, modo `publish`, confirmação `PUBLICAR_R2`,
   aprovar o Environment quando solicitado.
4. Verificar que `https://dados.imobiliarista.net/portal/cities.json`
   responde `200` (mesmo que com `{"cities": []}` — um catálogo vazio é
   sucesso, não falha).

Este workflow nunca faz deploy do Worker, nunca altera DNS/bindings/
secrets, e o adapter que ele chama (`business/r2ReadModelsAdapter.js`)
nunca oferece exclusão de objetos.
