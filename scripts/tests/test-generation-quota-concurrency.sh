#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a local Supabase/Postgres test database; remote hosts are refused.}"
host="$(python3 -c 'import os, urllib.parse; print(urllib.parse.urlsplit(os.environ["DATABASE_URL"]).hostname or "")')"
case "$host" in
  localhost|127.0.0.1|::1) ;;
  *) echo "Refusing non-local database host." >&2; exit 2 ;;
esac

tmpdir="$(mktemp -d "${TMPDIR:-/dev/shm}/studio-quota.XXXXXX")"
user_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
cleanup() {
  psql "$DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -v test_user="$user_id" >/dev/null 2>&1 <<'SQL' || true
    delete from public.studio_generation_quota_reservations where user_id = :'test_user'::uuid;
    delete from public.studio_generation_user_limits where user_id = :'test_user'::uuid;
    delete from auth.users where id = :'test_user'::uuid;
SQL
  rm -rf "$tmpdir"
}
trap cleanup EXIT

psql "$DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -v test_user="$user_id" <<'SQL'
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values (:'test_user'::uuid, 'authenticated', 'authenticated', 'quota-concurrency-' || :'test_user' || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
insert into public.studio_generation_user_limits(user_id, daily_video_limit, daily_image_limit)
values (:'test_user'::uuid, 2, 2)
on conflict (user_id) do update set daily_video_limit = 2, daily_image_limit = 2;
SQL

run_race() {
  local kind="$1" limit="$2" expected="$3" fn
  case "$kind" in
    image) fn="reserve_image_slot" ;;
    video) fn="reserve_video_slot" ;;
    *) echo "Unknown generation kind." >&2; return 2 ;;
  esac
  rm -f "$tmpdir"/*.result
  local i request_id
  local -a pids=()
  for i in $(seq 1 10); do
    request_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
    psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 \
      -c "select coalesce(($fn('$user_id', '$request_id')->>'ok')::boolean, false);" \
      >"$tmpdir/$i.result" &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do wait "$pid"; done
  local accepted used
  accepted="$(grep -hxc 't' "$tmpdir"/*.result | awk '{sum += $1} END {print sum+0}')"
  used="$(psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 \
    -c "select count(*) from public.studio_generation_quota_reservations where user_id = '$user_id' and generation_kind = '$kind' and status in ('reserved','consumed');")"
  if [ "$accepted" -gt "$limit" ] || [ "$used" -gt "$limit" ]; then
    echo "Quota race detected for $kind: accepted=$accepted used=$used limit=$limit" >&2
    return 1
  fi
  if [ "$accepted" -ne "$expected" ] || [ "$used" -ne "$expected" ]; then
    echo "Unexpected concurrent result for $kind: accepted=$accepted used=$used expected=$expected" >&2
    return 1
  fi
  echo "PASS: 10 concurrent $kind reservations accepted $accepted (limit $limit)."
}

run_race image 2 2
run_race video 2 1
