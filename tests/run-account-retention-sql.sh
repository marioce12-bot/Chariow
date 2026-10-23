#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG=/usr/lib/postgresql/16/bin
DATA="$(mktemp -d /workspace/retention-pg.XXXXXX)"
PORT=55439
cleanup(){ "$PG/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
"$PG/initdb" -D "$DATA" --no-locale --encoding=UTF8 --auth=trust >/dev/null
"$PG/pg_ctl" -D "$DATA" -o "-F -p $PORT -k $DATA" -l "$DATA/server.log" start >/dev/null
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$DATA" -p "$PORT" -U ubuntu postgres)
"${PSQL[@]}" <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(current_setting('request.jwt.claim.role',true),'') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
grant usage on schema auth to authenticated, service_role; grant execute on all functions in schema auth to authenticated, service_role;
create schema extensions; create extension pgcrypto with schema extensions;
SQL
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260828010000_initial_schema.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260828190000_trial_subscription_state.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260829220000_subscription_trial_status.sql"
"${PSQL[@]}" <<'SQL'
alter table public.subscriptions add column if not exists trial_ends_at timestamptz;
create table public.payment_events(id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete set null, payload jsonb);
SQL
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261023120000_account_retention_preview.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/account_retention_preview.sql"
