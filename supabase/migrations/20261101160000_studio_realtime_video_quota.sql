begin;

create table if not exists public.studio_generation_user_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  daily_video_limit integer not null default 2 check (daily_video_limit between 0 and 10),
  daily_image_limit integer not null default 50 check (daily_image_limit between 0 and 500),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_generation_quota_reservations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  generation_kind text not null check (generation_kind in ('video', 'image')),
  quota_date date not null,
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

create index if not exists studio_generation_quota_daily_idx
  on public.studio_generation_quota_reservations(user_id, generation_kind, quota_date, status);
create unique index if not exists studio_video_one_active_per_user_idx
  on public.studio_generation_quota_reservations(user_id)
  where generation_kind = 'video' and status = 'reserved';

alter table public.studio_generation_user_limits enable row level security;
alter table public.studio_generation_quota_reservations enable row level security;
revoke all on public.studio_generation_user_limits from public, anon, authenticated;
revoke all on public.studio_generation_quota_reservations from public, anon, authenticated;
grant select on public.studio_generation_user_limits to authenticated;
grant select on public.studio_generation_quota_reservations to authenticated;
grant all on public.studio_generation_user_limits to service_role;
grant all on public.studio_generation_quota_reservations to service_role;
drop policy if exists "Users can read own Studio generation limits" on public.studio_generation_user_limits;
create policy "Users can read own Studio generation limits"
  on public.studio_generation_user_limits for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can read own Studio quota reservations" on public.studio_generation_quota_reservations;
create policy "Users can read own Studio quota reservations"
  on public.studio_generation_quota_reservations for select to authenticated using (auth.uid() = user_id);

create or replace function public.reserve_generation_slot(p_user_id uuid, p_request_id uuid, p_generation_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
  v_used integer;
  v_day date := (timezone('utc', now()))::date;
  v_existing record;
  v_active_request uuid;
begin
  if p_user_id is null or p_request_id is null or p_generation_kind is null or p_generation_kind not in ('video', 'image') then
    raise exception 'valid user_id, request_id and generation_kind are required';
  end if;

  insert into public.studio_generation_user_limits(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
  -- Serialize reservations per user so concurrent requests cannot exceed a daily cap.
  select case when p_generation_kind = 'video' then daily_video_limit else daily_image_limit end
    into v_limit
  from public.studio_generation_user_limits
  where user_id = p_user_id
  for update;

  select generation_kind, quota_date, status into v_existing
  from public.studio_generation_quota_reservations
  where user_id = p_user_id and request_id = p_request_id;
  if found then
    return jsonb_build_object(
      'ok', v_existing.generation_kind = p_generation_kind and v_existing.status in ('reserved', 'consumed'),
      'duplicate', true,
      'reason', case when v_existing.generation_kind <> p_generation_kind then 'IDEMPOTENCY_KEY_REUSED' when v_existing.status = 'released' then 'RESERVATION_RELEASED' else null end,
      'status', v_existing.status,
      'quota_date', v_existing.quota_date,
      'daily_limit', v_limit
    );
  end if;

  if p_generation_kind = 'video' then
    select request_id into v_active_request
    from public.studio_generation_quota_reservations
    where user_id = p_user_id and generation_kind = 'video' and status = 'reserved'
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'reason', 'VIDEO_GENERATION_ACTIVE', 'active_request_id', v_active_request, 'daily_limit', v_limit);
    end if;
  end if;

  select count(*)::integer into v_used
  from public.studio_generation_quota_reservations
  where user_id = p_user_id and generation_kind = p_generation_kind
    and quota_date = v_day and status in ('reserved', 'consumed');
  if v_used >= v_limit then
    return jsonb_build_object('ok', false, 'reason', case when p_generation_kind = 'video' then 'DAILY_VIDEO_LIMIT' else 'DAILY_IMAGE_LIMIT' end,
      'used', v_used, 'daily_limit', v_limit, 'quota_date', v_day,
      'reset_at', ((v_day + 1)::timestamp at time zone 'UTC'));
  end if;

  insert into public.studio_generation_quota_reservations(user_id, request_id, generation_kind, quota_date, status)
  values (p_user_id, p_request_id, p_generation_kind, v_day, 'reserved');
  return jsonb_build_object('ok', true, 'duplicate', false, 'status', 'reserved',
    'used', v_used + 1, 'daily_limit', v_limit, 'quota_date', v_day,
    'reset_at', ((v_day + 1)::timestamp at time zone 'UTC'));
end;
$$;

create or replace function public.complete_generation_slot(p_user_id uuid, p_request_id uuid, p_generation_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_status text;
begin
  update public.studio_generation_quota_reservations
  set status = 'consumed', updated_at = now()
  where user_id = p_user_id and request_id = p_request_id and generation_kind = p_generation_kind and status = 'reserved'
  returning status into v_status;
  if not found then
    select status into v_status from public.studio_generation_quota_reservations
    where user_id = p_user_id and request_id = p_request_id and generation_kind = p_generation_kind;
  end if;
  return jsonb_build_object('completed', v_status = 'consumed', 'status', v_status);
end;
$$;

create or replace function public.release_generation_slot(p_user_id uuid, p_request_id uuid, p_generation_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_status text;
begin
  update public.studio_generation_quota_reservations
  set status = 'released', updated_at = now()
  where user_id = p_user_id and request_id = p_request_id and generation_kind = p_generation_kind and status = 'reserved'
  returning status into v_status;
  return jsonb_build_object('released', found, 'status', coalesce(v_status, 'unchanged'));
end;
$$;

create or replace function public.reserve_video_slot(p_user_id uuid, p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public.reserve_generation_slot(p_user_id, p_request_id, 'video'); $$;
create or replace function public.reserve_image_slot(p_user_id uuid, p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public.reserve_generation_slot(p_user_id, p_request_id, 'image'); $$;
create or replace function public.complete_video_slot(p_user_id uuid, p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public.complete_generation_slot(p_user_id, p_request_id, 'video'); $$;
create or replace function public.complete_image_slot(p_user_id uuid, p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public.complete_generation_slot(p_user_id, p_request_id, 'image'); $$;
create or replace function public.release_video_slot(p_user_id uuid, p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public.release_generation_slot(p_user_id, p_request_id, 'video'); $$;
create or replace function public.release_image_slot(p_user_id uuid, p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public.release_generation_slot(p_user_id, p_request_id, 'image'); $$;

create or replace function public.get_studio_generation_quota(p_user_id uuid, p_generation_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
  v_used integer;
  v_day date := (timezone('utc', now()))::date;
begin
  if p_user_id is null or p_generation_kind is null or p_generation_kind not in ('video', 'image') then raise exception 'valid user_id and generation_kind are required'; end if;
  insert into public.studio_generation_user_limits(user_id) values (p_user_id) on conflict (user_id) do nothing;
  select case when p_generation_kind = 'video' then daily_video_limit else daily_image_limit end into v_limit
    from public.studio_generation_user_limits where user_id = p_user_id;
  select count(*)::integer into v_used from public.studio_generation_quota_reservations
    where user_id = p_user_id and generation_kind = p_generation_kind and quota_date = v_day and status in ('reserved', 'consumed');
  return jsonb_build_object('quota_date', v_day, 'used', v_used, 'daily_limit', v_limit,
    'reset_at', ((v_day + 1)::timestamp at time zone 'UTC'));
end;
$$;

revoke all on function public.reserve_generation_slot(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_generation_slot(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.release_generation_slot(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reserve_video_slot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reserve_image_slot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_video_slot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_image_slot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_video_slot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_image_slot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_studio_generation_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_generation_slot(uuid, uuid, text) to service_role;
grant execute on function public.complete_generation_slot(uuid, uuid, text) to service_role;
grant execute on function public.release_generation_slot(uuid, uuid, text) to service_role;
grant execute on function public.reserve_video_slot(uuid, uuid) to service_role;
grant execute on function public.reserve_image_slot(uuid, uuid) to service_role;
grant execute on function public.complete_video_slot(uuid, uuid) to service_role;
grant execute on function public.complete_image_slot(uuid, uuid) to service_role;
grant execute on function public.release_video_slot(uuid, uuid) to service_role;
grant execute on function public.release_image_slot(uuid, uuid) to service_role;
grant execute on function public.get_studio_generation_quota(uuid, text) to service_role;

-- Realtime clients refetch the safe task projection after a row update; RLS still
-- limits events to the owner and the client never consumes raw payload fields.
grant select on public.studio_generations to authenticated;
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Required publication supabase_realtime is missing';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'studio_generations'
  ) then
    alter publication supabase_realtime add table public.studio_generations;
  end if;
end;
$$;

commit;
