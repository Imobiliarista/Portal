# Changelog

## Etapa 1 — Fundação (§90)

- Estrutura completa do repositório conforme §67 (placeholders onde ainda
  não há lógica de negócio).
- `core/` implementado: auth (hash de senha PBKDF2), session (token
  assinado HMAC stateless), tenant, permissions, validation (allowlist),
  security (headers §81, CORS §80), router, response, logger (redação de
  campos sensíveis §79), app (composição).
- `storage/` implementado: keys (builders determinísticos), private,
  public, media (validação MIME/tamanho §57), indexes (login/slug/broker→
  listings, sem varredura de bucket §26), cache (TTLs §59-§61).
- 9 JSON Schemas em `schemas/`.
- `wrangler.toml` com bindings para os 3 buckets R2 (`imob-private`,
  `imob-data`, `imob-media`) e Static Assets apontando para `frontend/`.
- 84 testes unitários (`node --test`) cobrindo `core/` e `storage/`.
