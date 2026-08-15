-- scripts/db-seed/seed-superadmin-teste.sql
--
-- Cria duas contas de teste em `corretores` (D1: imob-bd):
--   1) Superadmin  — usuário ADMIN,  senha 9999
--   2) Corretor    — usuário TESTE,  senha 6666, já aprovado, com
--      minisite liberado no subdomínio teste.imobiliarista.net
--
-- Hash de senha: PBKDF2-SHA256, 100.000 iterações, salt de 16 bytes —
-- mesmo esquema real de src/lib/senha.ts (hashSenha/verificarSenha),
-- usado por routes/api-auth-login.ts. Gerado fora do Worker com Node
-- (crypto.pbkdf2Sync), verificado byte-a-byte contra crypto.subtle
-- (Web Crypto) antes de ir para este arquivo — não é um esquema novo.
--
-- nome_usuario/cpf/creci/email são UNIQUE: rodar este arquivo duas vezes
-- falha com erro de constraint (não sobrescreve nem duplica).
--
-- Uso (revisar antes de rodar em produção):
--   wrangler d1 execute imob-bd --remote --file=./scripts/db-seed/seed-superadmin-teste.sql
--
-- Sem BEGIN/COMMIT explícito de propósito: nenhuma migration deste repo
-- usa (0001–0014), consistente com a forma como `wrangler d1 execute
-- --file` roda contra o D1 remoto.

-- 1) Superadmin — ADMIN / 9999
INSERT INTO corretores (
  nome_completo, cpf, creci, nome_usuario, senha_hash, senha_salt,
  email, status, papel, criado_em, atualizado_em
) VALUES (
  'Superadmin (Teste)',
  '00000000000',
  'ADMIN-TESTE',
  'ADMIN',
  '4UCQthY69u9sI7sCnjWwnVIg9ccU3GHbKDDmXA6MVU8=',
  'kFRySOvVK3pvQok3h38UIQ==',
  'admin.teste@imobiliarista.net',
  'aprovado',
  'superadmin',
  datetime('now'),
  datetime('now')
);

-- 2) Corretor de teste — TESTE / 6666, já aprovado
INSERT INTO corretores (
  nome_completo, cpf, creci, nome_usuario, senha_hash, senha_salt,
  email, status, papel, plano_id, criado_em, atualizado_em
) VALUES (
  'Corretor de Teste',
  '11111111111',
  'TESTE-0001',
  'TESTE',
  'l28FdQRFYjMUh9/r62mINLgvD4mbDPblaB6UFK8ExoI=',
  '8FZqCqR1hoTW0k9nf9jyEA==',
  'corretor.teste@imobiliarista.net',
  'aprovado',
  'corretor',
  (SELECT id FROM planos WHERE nome = 'Plano 1' LIMIT 1),
  datetime('now'),
  datetime('now')
);

-- 3) Minisite do corretor de teste — subdomínio teste.imobiliarista.net,
-- já liberado (offline = 0), igual ao efeito de aprovarPreCadastro().
INSERT INTO minisites (corretor_id, slug, offline, criado_em, atualizado_em)
VALUES (
  (SELECT id FROM corretores WHERE nome_usuario = 'TESTE'),
  'teste',
  0,
  datetime('now'),
  datetime('now')
);

-- 4) Config de upload padrão — mesma linha que o pré-cadastro real cria
-- em routes/api-auth-cadastro.ts (5.000.000 bytes).
INSERT INTO config_upload_corretor (corretor_id, max_resolucao_upload_bytes, criado_em, atualizado_em)
VALUES (
  (SELECT id FROM corretores WHERE nome_usuario = 'TESTE'),
  5000000,
  datetime('now'),
  datetime('now')
);
