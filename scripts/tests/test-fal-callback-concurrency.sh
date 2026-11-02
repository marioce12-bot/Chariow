#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to a local Supabase/Postgres test database; remote hosts are refused.}"
host="$(python3 -c 'import os, urllib.parse; print(urllib.parse.urlsplit(os.environ["DATABASE_URL"]).hostname or "")')"
case "$host" in
  localhost|127.0.0.1|::1) ;;
  *) echo "Refusing non-local database host." >&2; exit 2 ;;
esac
tmpdir="$(mktemp -d "${TMPDIR:-/dev/shm}/fal-callback.XXXXXX")"
user_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
generation_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
credit_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
request_id="fal-concurrency-$(python3 -c 'import uuid; print(uuid.uuid4())')"
credit_external_id="fal-credit-$(python3 -c 'import uuid; print(uuid.uuid4())')"
cleanup() {
  psql "$DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -v user_id="$user_id" -v generation_id="$generation_id" >/dev/null 2>&1 <<'SQL' || true
    delete from public.studio_generations where id = :'generation_id'::uuid;
    delete from auth.users where id = :'user_id'::uuid;
SQL
  rm -rf "$tmpdir"
}
trap cleanup EXIT
psql "$DATABASE_URL" -Xq -v ON_ERROR_STOP=1 \
  -v user_id="$user_id" -v generation_id="$generation_id" -v credit_id="$credit_id" \
  -v request_id="$request_id" -v credit_external_id="$credit_external_id" <<'SQL'
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values (:'user_id'::uuid, 'authenticated', 'authenticated', 'fal-concurrency-' || :'user_id' || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
update public.credit_accounts set balance = 100, reserved = 5 where user_id = :'user_id'::uuid;
insert into public.credit_transactions (id, user_id, kind, credits, balance_before, balance_after, operation, external_id, status)
values (:'credit_id'::uuid, :'user_id'::uuid, 'debit', 5, 100, 100, 'video_generation', :'credit_external_id', 'pending');
insert into public.studio_generations(id, user_id, kind, prompt, options, status, provider_request_id, credit_transaction_id, created_at)
values (:'generation_id'::uuid, :'user_id'::uuid, 'video', 'callback concurrency fixture', '{}'::jsonb, 'processing', :'request_id', :'credit_id'::uuid, now() - interval '15 minutes');
SQL
slot_ok="$(psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 \
  -c "select public.reserve_video_slot('$user_id', '$generation_id')->>'ok';")"
if [ "$slot_ok" != "true" ]; then
  echo "Could not reserve the local video quota fixture (ok=$slot_ok)." >&2
  exit 1
fi

pids=()
for i in $(seq 1 10); do
  token="$(python3 -c 'import uuid; print(uuid.uuid4())')"
  psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 \
    -c "select coalesce(public.claim_studio_video_callback('$request_id', '$user_id', 'OK', '$token')->>'outcome', 'null') || ':' || '$token';" \
    >"$tmpdir/$i.result" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
claimed="$(grep -hEc '^claimed:' "$tmpdir"/*.result | awk '{sum += $1} END {print sum+0}')"
busy="$(grep -hEc '^busy:' "$tmpdir"/*.result | awk '{sum += $1} END {print sum+0}')"
if [ "$claimed" -ne 1 ] || [ "$busy" -ne 9 ]; then
  echo "Callback lease race: claimed=$claimed busy=$busy (expected 1 and 9)." >&2
  cat "$tmpdir"/*.result >&2
  exit 1
fi
claimed_token="$(grep -h '^claimed:' "$tmpdir"/*.result | head -n1 | cut -d: -f2)"
conflict_token="$(python3 -c 'import uuid; print(uuid.uuid4())')"
conflict="$(psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 \
  -c "select public.claim_studio_video_callback('$request_id', '$user_id', 'ERROR', '$conflict_token')->>'outcome';")"
if [ "$conflict" != "conflict" ]; then
  echo "A conflicting callback status was not rejected (outcome=$conflict)." >&2
  exit 1
fi
stored="$(psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 \
  -c "select public.record_studio_video_callback_asset('$generation_id', '$claimed_token', 'cloudinary-private:timeout-race-test');")"
if [ "$stored" != "t" ]; then
  echo "The current lease could not persist the imported fixture asset (stored=$stored)." >&2
  exit 1
fi
active_timeout="$(psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 \
  -c "select public.fail_stale_studio_video_generation('$generation_id', now() - interval '12 minutes', 'timeout');")"
if [ "$active_timeout" != "f" ]; then
  echo "Timeout invalidated a generation with an active callback lease." >&2
  exit 1
fi
psql "$DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -v generation_id="$generation_id" <<'SQL'
update public.studio_generations
set provider_callback_lease_until = now() - interval '1 second'
where id = :'generation_id'::uuid;
SQL

psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 \
  -c "select public.complete_studio_video_callback('$generation_id', '$claimed_token', 'cloudinary-private:timeout-race-test');" \
  >"$tmpdir/complete.result" &
complete_pid="$!"
psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 \
  -c "select public.fail_stale_studio_video_generation('$generation_id', now() - interval '12 minutes', 'timeout');" \
  >"$tmpdir/timeout.result" &
timeout_pid="$!"
wait "$complete_pid"
wait "$timeout_pid"
if [ "$(cat "$tmpdir/complete.result")" != "f" ] || [ "$(cat "$tmpdir/timeout.result")" != "t" ]; then
  echo "Expired callback/timeout race produced completion=$(cat "$tmpdir/complete.result") timeout=$(cat "$tmpdir/timeout.result"); expected false/true." >&2
  exit 1
fi
refund="$(psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 \
  -c "select public.refund_credit_debit('$credit_id');")"
release="$(psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 \
  -c "select public.release_video_slot('$user_id', '$generation_id')->>'released';")"
state="$(psql "$DATABASE_URL" -XAtq -F: -v ON_ERROR_STOP=1 \
  -c "select (select status from public.credit_transactions where id = '$credit_id'), (select status from public.studio_generation_quota_reservations where user_id = '$user_id' and request_id = '$generation_id'), (select balance::text || ':' || reserved::text from public.credit_accounts where user_id = '$user_id');")"
if [ "$refund" != "t" ] || [ "$release" != "true" ] || [ "$state" != "refunded:released:100:0" ]; then
  echo "Late callback changed compensation state (refund=$refund release=$release state=$state)." >&2
  exit 1
fi
echo "PASS: ten concurrent callbacks yielded one lease; an expired callback racing timeout did not charge credits or consume quota."
