#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL="$ROOT/scripts/tests/shopify-retention-privacy.sql"
MIGRATION="$ROOT/supabase/migrations/20261023100000_shopify_retention_privacy.sql"
# Safety: this runner accepts no URL/host/connection overrides and never sources .env.
if [[ $# -ne 0 ]]; then
  echo "Usage: $0 (no connection arguments accepted; disposable local cluster only)" >&2
  exit 2
fi
if [[ ! -x /usr/lib/postgresql/16/bin/postgres ]] || ! command -v pg_virtualenv >/dev/null; then
  echo "PostgreSQL 16 and pg_virtualenv are required" >&2
  exit 2
fi
[[ -f "$SQL" && -f "$MIGRATION" ]] || { echo "Missing SQL test or migration" >&2; exit 2; }
# The helper is a separate file to keep shell/SQL quoting literal and auditable.
TMP_HELPER="$(mktemp)"
trap 'rm -f "$TMP_HELPER"' EXIT
cat >"$TMP_HELPER" <<'HELPER'
#!/usr/bin/env bash
set -euo pipefail
cd "$1"
sql="$2"
tmp="$(mktemp -d)"
pids=()
cleanup() { for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done; rm -rf "$tmp"; }
trap cleanup EXIT
psql_cmd=(psql -X --host=127.0.0.1 --port="$PGPORT" --username="$(id -un)" --dbname=postgres --no-password --set=ON_ERROR_STOP=1 --set=statement_timeout=10s)
"${psql_cmd[@]}" --file="$sql"
wait_flag() {
  local flag="$1" i
  for i in $(seq 1 500); do [[ -e "$flag" ]] && return 0; sleep 0.02; done
  echo "Timed out waiting for $flag" >&2; return 1
}
cat >"$tmp/a-import.sql" <<EOF_A
BEGIN;
INSERT INTO public.chariow_sales(store_id,chariow_sale_id,occurred_at) VALUES ('00000000-0000-4000-8000-000000000001','shopify:00000000-0000-4000-8000-000000000001:501',now());
\! touch $tmp/a-import-ready
SELECT pg_sleep(1);
COMMIT;
EOF_A
printf "%s\n" "SELECT public.redact_shopify_orders('alpha.myshopify.com',ARRAY['501']);" >"$tmp/b-redact.sql"
"${psql_cmd[@]}" --file="$tmp/a-import.sql" & a=$!; pids+=("$a")
wait_flag "$tmp/a-import-ready"
"${psql_cmd[@]}" --file="$tmp/b-redact.sql" & b=$!; pids+=("$b")
set +e; wait "$a"; ac=$?; wait "$b"; bc=$?; set -e
[[ $ac -eq 0 && $bc -eq 0 ]] || { echo "race 501 failed (A=$ac B=$bc)" >&2; exit 1; }
cat >"$tmp/a-redact.sql" <<EOF_A
BEGIN;
SELECT public.redact_shopify_orders('alpha.myshopify.com',ARRAY['502']);
\! touch $tmp/a-redact-ready
SELECT pg_sleep(1);
COMMIT;
EOF_A
cat >"$tmp/b-import.sql" <<EOF_B
INSERT INTO public.chariow_sales(store_id,chariow_sale_id,occurred_at) VALUES ('00000000-0000-4000-8000-000000000001','shopify:00000000-0000-4000-8000-000000000001:502',now());
EOF_B
"${psql_cmd[@]}" --file="$tmp/a-redact.sql" & a=$!; pids+=("$a")
wait_flag "$tmp/a-redact-ready"
"${psql_cmd[@]}" --file="$tmp/b-import.sql" & b=$!; pids+=("$b")
set +e; wait "$a"; ac=$?; wait "$b"; bc=$?; set -e
[[ $ac -eq 0 && $bc -eq 0 ]] || { echo "race 502 failed (A=$ac B=$bc)" >&2; exit 1; }
"${psql_cmd[@]}" <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.chariow_sales WHERE chariow_sale_id LIKE '%:501' OR chariow_sale_id LIKE '%:502') THEN RAISE EXCEPTION 'concurrent Shopify sale survived'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shopify_order_redactions WHERE shop_domain='alpha.myshopify.com' AND order_id_hash=encode(digest('502','sha256'),'hex')) THEN RAISE EXCEPTION '502 redaction marker missing'; END IF;
END $$;
SQL
echo "PASS: Shopify retention/privacy two-session concurrency races"
HELPER
chmod +x "$TMP_HELPER"
PGHOST=127.0.0.1 PGPORT=55439 PGUSER="$(id -un)" PGDATABASE=postgres \
  pg_virtualenv -v 16 -o "listen_addresses=localhost" \
  bash "$TMP_HELPER" "$ROOT" "$SQL"
