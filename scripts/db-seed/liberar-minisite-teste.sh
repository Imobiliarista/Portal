#!/usr/bin/env bash
# scripts/db-seed/liberar-minisite-teste.sh
#
# routes/minisite.ts nunca lê `minisites` direto do D1 no caminho público —
# lê tenants/{slug}/status.json em R2 (bucket DADOS_CACHE = "imob-dados"),
# materializado por jobs/gerar-status-minisite.ts sempre que o status muda
# via app (pré-cadastro ou aprovação do Superadmin). Como este seed insere
# o corretor de teste direto no D1, sem passar pelo fluxo do app, ninguém
# enfileira essa materialização — sem este passo, teste.imobiliarista.net
# responde "ainda não está disponível" mesmo com minisites.offline = 0.
#
# Rodar DEPOIS de seed-superadmin-teste.sql, mesmo ambiente (--remote =
# produção). Requer `wrangler` autenticado e `jq` instalado.
#
# Uso:
#   bash scripts/db-seed/liberar-minisite-teste.sh

set -euo pipefail

DB="imob-bd"
BUCKET="imob-dados"
SLUG="teste"

echo "Consultando corretor_id/minisite_id de '$SLUG' em $DB (--remote)..."

RESULT_JSON=$(wrangler d1 execute "$DB" --remote --json --command \
  "SELECT m.id as minisite_id, m.corretor_id FROM minisites m WHERE m.slug = '$SLUG' LIMIT 1")

MINISITE_ID=$(echo "$RESULT_JSON" | jq -r '.[0].results[0].minisite_id')
CORRETOR_ID=$(echo "$RESULT_JSON" | jq -r '.[0].results[0].corretor_id')

if [[ "$MINISITE_ID" == "null" || -z "$MINISITE_ID" ]]; then
  echo "Erro: minisite com slug='$SLUG' não encontrado. Rodou o seed-superadmin-teste.sql primeiro?" >&2
  exit 1
fi

echo "minisite_id=$MINISITE_ID corretor_id=$CORRETOR_ID"

STATUS_FILE=$(mktemp)
cat > "$STATUS_FILE" <<JSON
{
  "existe": true,
  "liberado": true,
  "corretor_id": $CORRETOR_ID,
  "minisite_id": $MINISITE_ID,
  "last_updated": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
}
JSON

echo "Enviando tenants/$SLUG/status.json para R2 ($BUCKET)..."
wrangler r2 object put "$BUCKET/tenants/$SLUG/status.json" --file="$STATUS_FILE" --content-type=application/json --remote

rm -f "$STATUS_FILE"
echo "Pronto: teste.imobiliarista.net deve responder liberado=true."
