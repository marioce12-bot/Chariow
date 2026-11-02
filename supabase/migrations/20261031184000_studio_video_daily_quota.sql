-- Quotas Studio vidéo uniquement par utilisateur : deux vidéos par jour,
-- une génération active à la fois. Aucun plafond global Vendeo n'est appliqué.
create table public.studio_video_daily_quota (
  generation_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_day date not null,
  resolution text not null check (resolution in ('480p', '720p')),
  status text not null default 'reserved'
    check (status in ('reserved', 'submitted', 'uncertain', 'completed', 'failed_spent', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index studio_video_daily_quota_user_day_idx
  on public.studio_video_daily_quota(user_id, usage_day, status);
create unique index studio_video_daily_quota_one_active_idx
  on public.studio_video_daily_quota(user_id)
  where status in ('reserved', 'submitted', 'uncertain');

alter table public.studio_video_daily_quota enable row level security;
revoke all on table public.studio_video_daily_quota from public, anon, authenticated;

create or replace function public.reserve_studio_video_quota(
  p_user_id uuid,
  p_generation_id uuid,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (timezone('utc', now()))::date;
  v_user_count integer;
  v_user_active integer;
begin
  if p_user_id is null or p_generation_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;
  if p_resolution not in ('480p', '720p') then
    return jsonb_build_object('ok', false, 'code', 'UNPRICED_RESOLUTION');
  end if;

  -- Serialize only this user's reservation checks. The partial unique index is
  -- a second guard against two simultaneous active jobs for the same user/day.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if exists (
    select 1 from public.studio_video_daily_quota q
    where q.generation_id = p_generation_id
  ) then
    return jsonb_build_object('ok', false, 'duplicate', true, 'code', 'REQUEST_ALREADY_RESERVED');
  end if;

  select count(*)::integer into v_user_count
  from public.studio_video_daily_quota q
  where q.user_id = p_user_id and q.usage_day = v_day and q.status <> 'released';

  select count(*)::integer into v_user_active
  from public.studio_video_daily_quota q
  where q.user_id = p_user_id
    and q.status in ('reserved', 'submitted', 'uncertain');

  if v_user_active >= 1 then
    return jsonb_build_object('ok', false, 'code', 'USER_ACTIVE_LIMIT', 'active', v_user_active);
  end if;
  if v_user_count >= 2 then
    return jsonb_build_object('ok', false, 'code', 'USER_DAILY_LIMIT', 'used', v_user_count, 'limit', 2);
  end if;

  insert into public.studio_video_daily_quota (
    generation_id, user_id, usage_day, resolution, status
  ) values (
    p_generation_id, p_user_id, v_day, p_resolution, 'reserved'
  );

  return jsonb_build_object('ok', true, 'user_daily_used', v_user_count + 1, 'user_daily_limit', 2);
end;
$$;

create or replace function public.set_studio_video_quota_state(
  p_user_id uuid,
  p_generation_id uuid,
  p_state text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  if p_state is null or p_state not in ('submitted', 'uncertain', 'completed', 'failed_spent', 'released') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select q.status into v_current
  from public.studio_video_daily_quota q
  where q.generation_id = p_generation_id and q.user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'QUOTA_RESERVATION_NOT_FOUND');
  end if;
  if v_current = p_state then
    return jsonb_build_object('ok', true, 'duplicate', true, 'state', v_current);
  end if;
  if v_current in ('released', 'completed', 'failed_spent') then
    return jsonb_build_object('ok', false, 'code', 'TERMINAL_STATE', 'state', v_current);
  end if;
  if v_current = 'reserved' and p_state not in ('submitted', 'uncertain', 'released') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TRANSITION', 'from', v_current, 'to', p_state);
  end if;
  if v_current in ('submitted', 'uncertain') and p_state = 'released' then
    return jsonb_build_object('ok', false, 'code', 'SPEND_MAY_HAVE_OCCURRED', 'state', v_current);
  end if;

  update public.studio_video_daily_quota
  set status = p_state, updated_at = now()
  where generation_id = p_generation_id and user_id = p_user_id;
  return jsonb_build_object('ok', true, 'state', p_state);
end;
$$;

revoke all on function public.reserve_studio_video_quota(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.set_studio_video_quota_state(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_studio_video_quota(uuid, uuid, text) to service_role;
grant execute on function public.set_studio_video_quota_state(uuid, uuid, text) to service_role;
