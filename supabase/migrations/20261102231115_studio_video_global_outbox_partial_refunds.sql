begin;

-- Plafond global atomique pour les jobs vidéo Vendeo. La réservation est
-- sérialisée par cette ligne puis par utilisateur dans reserve_studio_video_quota.
create table if not exists public.studio_video_global_limits (
  singleton boolean primary key default true check (singleton),
  max_active_jobs integer not null default 5 check (max_active_jobs between 1 and 100),
  updated_at timestamptz not null default now()
);
insert into public.studio_video_global_limits(singleton, max_active_jobs)
values (true, 5) on conflict (singleton) do nothing;
alter table public.studio_video_global_limits enable row level security;
revoke all on table public.studio_video_global_limits from public, anon, authenticated;

create index if not exists studio_video_daily_quota_global_active_idx
  on public.studio_video_daily_quota(status, updated_at)
  where status in ('reserved', 'submitted', 'uncertain');

create or replace function public.reserve_studio_video_quota(
  p_user_id uuid,
  p_generation_id uuid,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day date := (timezone('utc', now()))::date;
  v_user_count integer;
  v_user_active integer;
  v_global_active integer;
  v_global_limit integer;
begin
  if p_user_id is null or p_generation_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;
  if p_resolution not in ('480p', '720p') then
    return jsonb_build_object('ok', false, 'code', 'UNPRICED_RESOLUTION');
  end if;

  -- Toute réservation prend d’abord le même verrou global, ce qui rend le
  -- comptage du plafond atomique même sous forte concurrence.
  select max_active_jobs into v_global_limit
  from public.studio_video_global_limits where singleton = true for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'GLOBAL_LIMIT_UNAVAILABLE'); end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if exists (select 1 from public.studio_video_daily_quota q where q.generation_id = p_generation_id) then
    return jsonb_build_object('ok', false, 'duplicate', true, 'code', 'REQUEST_ALREADY_RESERVED');
  end if;

  select count(*)::integer into v_user_count
  from public.studio_video_daily_quota q
  where q.user_id = p_user_id and q.usage_day = v_day and q.status <> 'released';
  select count(*)::integer into v_user_active
  from public.studio_video_daily_quota q
  where q.user_id = p_user_id and q.status in ('reserved', 'submitted', 'uncertain');
  select count(*)::integer into v_global_active
  from public.studio_video_daily_quota q
  where q.status in ('reserved', 'submitted', 'uncertain');

  if v_user_active >= 1 then
    return jsonb_build_object('ok', false, 'code', 'USER_ACTIVE_LIMIT', 'active', v_user_active);
  end if;
  if v_user_count >= 2 then
    return jsonb_build_object('ok', false, 'code', 'USER_DAILY_LIMIT', 'used', v_user_count, 'limit', 2);
  end if;
  if v_global_active >= v_global_limit then
    return jsonb_build_object('ok', false, 'code', 'GLOBAL_ACTIVE_LIMIT', 'active', v_global_active, 'limit', v_global_limit);
  end if;

  insert into public.studio_video_daily_quota(generation_id, user_id, usage_day, resolution, status)
  values (p_generation_id, p_user_id, v_day, p_resolution, 'reserved');
  return jsonb_build_object('ok', true, 'user_daily_used', v_user_count + 1, 'user_daily_limit', 2, 'global_active', v_global_active + 1, 'global_limit', v_global_limit);
end;
$$;

-- Ajustement partiel append-only et idempotent. Si le débit est encore pending,
-- seule la part effectivement consommée est débitée; sinon un crédit de refund
-- séparé restitue la quote-part. L'identifiant externe empêche tout doublon.
create or replace function public.refund_studio_video_partial(
  p_transaction_id uuid,
  p_refund_credits integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.credit_transactions%rowtype;
  v_account public.credit_accounts%rowtype;
  v_before integer;
  v_after integer;
  v_consumed integer;
begin
  if p_transaction_id is null or p_refund_credits is null or p_refund_credits <= 0 or p_idempotency_key is null
     or length(p_idempotency_key) > 160 or p_idempotency_key !~ '^studio-video-partial:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;
  select * into v_tx from public.credit_transactions where id = p_transaction_id and kind = 'debit' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'DEBIT_NOT_FOUND'); end if;
  if exists (select 1 from public.credit_transactions where external_id = p_idempotency_key and kind = 'refund') then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if p_refund_credits >= v_tx.credits then
    return jsonb_build_object('ok', false, 'code', 'FULL_REFUND_REQUIRED');
  end if;
  if v_tx.status not in ('pending', 'completed') then
    return jsonb_build_object('ok', false, 'code', 'DEBIT_NOT_REFUNDABLE');
  end if;

  select * into v_account from public.credit_accounts where user_id = v_tx.user_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'CREDIT_ACCOUNT_NOT_FOUND'); end if;
  v_before := v_account.balance;
  v_consumed := v_tx.credits - p_refund_credits;
  if v_tx.status = 'pending' then
    if v_account.reserved < v_tx.credits or v_account.balance < v_consumed then
      return jsonb_build_object('ok', false, 'code', 'CREDIT_RESERVATION_MISMATCH');
    end if;
    update public.credit_accounts
      set reserved = reserved - v_tx.credits, balance = balance - v_consumed
      where user_id = v_tx.user_id;
    v_after := v_before - v_consumed;
    update public.credit_transactions
      set credits = v_consumed, balance_after = v_after, status = 'completed'
      where id = v_tx.id and status = 'pending';
  else
    update public.credit_accounts set balance = balance + p_refund_credits where user_id = v_tx.user_id;
    v_after := v_before + p_refund_credits;
  end if;

  insert into public.credit_transactions(user_id, kind, credits, balance_before, balance_after, operation, external_id, status, metadata)
  values (v_tx.user_id, 'refund', p_refund_credits, v_before, v_after, 'studio_video_partial_refund', p_idempotency_key, 'completed',
    jsonb_build_object('original_transaction_id', v_tx.id, 'refunded_credits', p_refund_credits, 'consumed_credits', v_consumed));
  return jsonb_build_object('ok', true, 'refunded_credits', p_refund_credits, 'consumed_credits', v_consumed);
end;
$$;

create table if not exists public.studio_video_reconcile_outbox (
  generation_id uuid primary key references public.studio_generations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed', 'needs_review')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_video_reconcile_due_idx
  on public.studio_video_reconcile_outbox(next_attempt_at, lease_until)
  where status = 'pending';
alter table public.studio_video_reconcile_outbox enable row level security;
revoke all on table public.studio_video_reconcile_outbox from public, anon, authenticated;

create or replace function public.enqueue_studio_video_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.kind = 'video' and new.status = 'processing' then
    insert into public.studio_video_reconcile_outbox(generation_id)
    values (new.id) on conflict (generation_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists studio_video_reconcile_outbox_enqueue on public.studio_generations;
create trigger studio_video_reconcile_outbox_enqueue
after insert or update of status on public.studio_generations
for each row execute function public.enqueue_studio_video_reconciliation();

create or replace function public.claim_studio_video_reconcile_batch(p_limit integer default 25)
returns table(generation_id uuid, attempts integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with due as (
    select o.generation_id
    from public.studio_video_reconcile_outbox o
    where o.status = 'pending' and o.next_attempt_at <= clock_timestamp()
      and (o.lease_until is null or o.lease_until <= clock_timestamp())
    order by o.next_attempt_at, o.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 50))
  ), claimed as (
    update public.studio_video_reconcile_outbox o
    set attempts = o.attempts + 1,
        lease_until = clock_timestamp() + interval '4 minutes',
        updated_at = clock_timestamp()
    from due where o.generation_id = due.generation_id
    returning o.generation_id, o.attempts
  )
  select claimed.generation_id, claimed.attempts from claimed;
end;
$$;

create or replace function public.finish_studio_video_reconcile(
  p_generation_id uuid,
  p_outcome text,
  p_retry_seconds integer default 1200
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_generation_id is null or p_outcome is null or p_outcome not in ('dispatched', 'still_active', 'manual_review', 'terminal') then return false; end if;
  update public.studio_video_reconcile_outbox o
  set status = case when p_outcome = 'terminal' then 'completed' when p_outcome = 'manual_review' then 'needs_review' else 'pending' end,
      next_attempt_at = clock_timestamp() + make_interval(secs => greatest(120, least(coalesce(p_retry_seconds, 1200), 86400))),
      lease_until = null,
      last_outcome = left(p_outcome, 80),
      updated_at = clock_timestamp()
  where o.generation_id = p_generation_id and o.status = 'pending' and o.lease_until > clock_timestamp();
  return found;
end;
$$;

create or replace function public.requeue_stale_studio_video_generation(p_generation_id uuid, p_stale_before timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_metadata jsonb;
begin
  if p_generation_id is null or p_stale_before is null then return false; end if;
  select metadata into v_metadata from public.studio_generations
  where id = p_generation_id and kind = 'video' and status = 'processing'
  for update;
  if not found then return false; end if;
  if coalesce((v_metadata->>'updatedAt')::timestamptz, now()) >= p_stale_before then return false; end if;
  if coalesce(v_metadata->>'phase', '') = 'queued' then return true; end if;
  update public.studio_generations
  set metadata = v_metadata || jsonb_build_object('phase', 'queued', 'reconciledAt', now(), 'updatedAt', now())
  where id = p_generation_id and kind = 'video' and status = 'processing';
  return found;
end;
$$;

revoke all on function public.reserve_studio_video_quota(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.refund_studio_video_partial(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.enqueue_studio_video_reconciliation() from public, anon, authenticated;
revoke all on function public.claim_studio_video_reconcile_batch(integer) from public, anon, authenticated;
revoke all on function public.finish_studio_video_reconcile(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.requeue_stale_studio_video_generation(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_studio_video_quota(uuid, uuid, text) to service_role;
grant execute on function public.refund_studio_video_partial(uuid, integer, text) to service_role;
grant execute on function public.claim_studio_video_reconcile_batch(integer) to service_role;
grant execute on function public.finish_studio_video_reconcile(uuid, text, integer) to service_role;
grant execute on function public.requeue_stale_studio_video_generation(uuid, timestamptz) to service_role;

-- Le dispatcher ne contacte la route que lorsque les deux valeurs sont placées
-- dans Supabase Vault. Aucun secret n'est stocké dans le code ou la migration.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise exception 'studio_video_reconciliation_requires_pg_cron';
  end if;
  if not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise exception 'studio_video_reconciliation_requires_pg_net';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'create extension pg_cron';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    execute 'create extension pg_net with schema extensions';
  end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception 'studio_video_reconciliation_pg_net_http_post_missing';
  end if;
end;
$$;

create or replace function public.dispatch_studio_video_reconciliation()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_url text; v_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v_url using 'STUDIO_VIDEO_RECONCILE_URL';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v_secret using 'STUDIO_VIDEO_RECONCILE_SECRET';
  if coalesce(v_url, '') !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$' or coalesce(v_secret, '') = '' then return; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 5000)'
    using v_url, jsonb_build_object('content-type', 'application/json', 'x-studio-video-reconcile-secret', v_secret), jsonb_build_object('limit', 25);
end;
$$;
revoke all on function public.dispatch_studio_video_reconciliation() from public, anon, authenticated;

do $$
declare v_job_id bigint;
begin
  if to_regclass('cron.job') is null then raise exception 'studio_video_reconciliation_cron_job_table_missing'; end if;
  select jobid into v_job_id from cron.job where jobname = 'studio-video-reconcile' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('studio-video-reconcile', '*/5 * * * *', 'select public.dispatch_studio_video_reconciliation()');
end;
$$;

commit;
