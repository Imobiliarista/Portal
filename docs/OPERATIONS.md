# Operações

## Pendências bloqueantes (Etapa 6)

4. **Catálogo nacional de municípios (IBGE)**: `business/data/cities-catalog.generated.js`
   é o que resolve `city.name`/`city.uf` (exigidos por
   `city-manifest.schema.json`) a partir do slug de cidade que
   `business/listings.js` guarda no draft do anúncio. O arquivo commitado
   hoje é só uma amostra pequena (4 cidades reais + um par sintético) — a
   sessão que implementou a Etapa 6 não tinha rede liberada para
   `servicodados.ibge.gov.br` (bloqueio de política do ambiente). Antes do
   deploy:

   ```bash
   npm run generate:cities   # roda scripts/generate-cities-catalog.js
   ```

   de um ambiente com rede liberada para o IBGE, e commitar o resultado
   (cobertura nacional, ~5.570 municípios). Sem isso, publicar um anúncio
   em qualquer cidade fora da amostra falha explicitamente com
   `UnknownCityError` — nunca silenciosamente.

## Pendências bloqueantes (Etapa 1)

Estas ações são manuais, no painel Cloudflare, e **bloqueiam** um
`wrangler versions upload`/`wrangler deploy` de ponta a ponta com os
bindings reais (o `wrangler deploy --dry-run` local já valida a sintaxe do
`wrangler.toml` sem elas, mas o binding não resolve contra um bucket real
até ele existir).

1. **Criar os 3 buckets R2** (Workers & Pages → R2):
   - `imob-private`
   - `imob-data`
   - `imob-media`

   Os nomes devem ser exatamente esses — `wrangler.toml` já referencia
   `bucket_name = "imob-private" | "imob-data" | "imob-media"` com os
   bindings `IMOB_PRIVATE` / `IMOB_DATA` / `IMOB_MEDIA`.

2. **Configurar o build do projeto** (Workers & Pages → *nome do worker* →
   Configurações → Build), assim que o projeto Cloudflare deste repositório
   existir:
   - **Comando da versão** (branches `claude/*`, não promove tráfego):
     `npx wrangler versions upload`
   - **Comando de implantação** (somente `main`): `npx wrangler deploy`

   Os dois campos **nunca** devem ter o mesmo valor — isso geraria deploy de
   produção completo a cada push de branch de trabalho.

3. **Custom Domain + Cache Rule para R2 DATA/MEDIA** (§59): o cache de JSON
   público depende de uma Cache Rule explícita no Custom Domain do bucket —
   não existe por padrão. TTLs alvo por tipo de objeto estão centralizados
   em `storage/cache.js` (`CACHE_TTL_SECONDS`); a Cache Rule no painel deve
   refletir esses mesmos valores.

## Segredos

Nenhum segredo vai para `wrangler.toml` nem para o Git (§3.1, §27). Desde a
Etapa 4 (Auth), `worker/auth.js` exige `env.SESSION_SECRET` para
assinar/verificar sessões (`core/session.js`) — sem ele, `POST
/api/auth/login` lança em vez de emitir um cookie. Provisionar com:

```bash
npx wrangler secret put SESSION_SECRET
```

**Pendente/bloqueante para deploy real** (assim como os 3 buckets R2 —
ver acima): este comando ainda não foi executado neste ambiente; sem o
secret configurado, `wrangler dev`/`deploy` sobem mas qualquer chamada a
`/api/auth/login` falha com erro 500 ("SESSION_SECRET ausente em env").

## Comandos locais

```bash
npm install
npm test                 # node --test — suíte completa
npm run validate:schemas # valida schemas/*.schema.json
npm run dev               # wrangler dev
npx wrangler deploy --dry-run  # valida wrangler.toml sem publicar

# Etapa 6 — Publicador
npm run generate:cities        # regenera business/data/cities-catalog.generated.js (IBGE)
npm run rebuild:listing -- <listingId>
npm run rebuild:broker -- <brokerId>
npm run rebuild:city -- <citySlug>
npm run rebuild:all            # 1 lote e para; use -- --all para processar até terminar
```
