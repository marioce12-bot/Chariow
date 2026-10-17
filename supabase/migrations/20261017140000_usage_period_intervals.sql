-- Immutable usage events allow exact period filtering; the existing summary tables
-- remain maintained for compatibility, but analytics below use event timestamps.
create table if not exists public.usage_intervals (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.usage_sessions(session_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  section text not null,
  seconds integer not null default 0 check (seconds between 0 and 60),
  visits integer not null default 0 check (visits between 0 and 1),
  occurred_at timestamptz not null default now()
);
create index if not exists usage_intervals_time_section_idx on public.usage_intervals(occurred_at desc, section);
create index if not exists usage_intervals_session_time_idx on public.usage_intervals(session_id, occurred_at desc);
create index if not exists usage_intervals_user_time_idx on public.usage_intervals(user_id, occurred_at desc);
alter table public.usage_intervals enable row level security;
revoke all on table public.usage_intervals from public, anon, authenticated;
grant all on table public.usage_intervals to service_role;

create or replace function public.track_usage_heartbeat(
  p_user_id uuid,
  p_session_id uuid,
  p_section text,
  p_seconds integer,
  p_new_visit boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  secs integer := greatest(0, least(coalesce(p_seconds, 0), 60));
  event_time timestamptz := now();
begin
  if p_section not in (
    'Vue d''ensemble', 'Vendeo AI', 'Studio', 'Pub', 'Comptes publicitaires',
    'Radar marché', 'Mes boutiques', 'Rapports', 'Pilotage auto', 'Abonnement',
    'Paramètres', 'Notifications'
  ) then
    raise exception 'Invalid usage section';
  end if;

  insert into public.usage_sessions(session_id, user_id, total_seconds)
  values (p_session_id, p_user_id, secs)
  on conflict (session_id) do update
    set last_seen_at = event_time,
        total_seconds = public.usage_sessions.total_seconds + secs
    where public.usage_sessions.user_id = p_user_id;

  if not exists (
    select 1 from public.usage_sessions
    where session_id = p_session_id and user_id = p_user_id
  ) then
    raise exception 'Usage session ownership mismatch';
  end if;

  insert into public.usage_section_stats(session_id, user_id, section, seconds, visits, updated_at)
  values (p_session_id, p_user_id, p_section, secs, case when coalesce(p_new_visit, false) then 1 else 0 end, event_time)
  on conflict (session_id, section) do update
    set seconds = public.usage_section_stats.seconds + excluded.seconds,
        visits = public.usage_section_stats.visits + excluded.visits,
        updated_at = event_time;

  insert into public.usage_intervals(session_id, user_id, section, seconds, visits, occurred_at)
  values (p_session_id, p_user_id, p_section, secs,
          case when coalesce(p_new_visit, false) then 1 else 0 end, event_time);
end;
$$;
revoke all on function public.track_usage_heartbeat(uuid, uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.track_usage_heartbeat(uuid, uuid, text, integer, boolean) to service_role;

create or replace function public.admin_usage_stats(p_days integer default 7)
returns jsonb
language sql
security definer
set search_path = public
as $$
with params as (
  select greatest(1, least(coalesce(p_days, 7), 90)) as d, now() as as_of
),
period_events as (
  select i.* from public.usage_intervals i, params p
  where i.occurred_at >= p.as_of - make_interval(days => p.d)
),
section_totals as (
  select e.section, sum(e.seconds)::bigint as seconds,
         sum(e.visits)::bigint as visits,
         count(distinct e.user_id)::bigint as users
  from period_events e
  group by e.section
),
session_totals as (
  select e.session_id, e.user_id, sum(e.seconds)::bigint as seconds
  from period_events e
  group by e.session_id, e.user_id
),
sess as (
  select count(*)::bigint as sessions,
         coalesce(round(avg(t.seconds)), 0)::bigint as avg_seconds,
         count(distinct t.user_id)::bigint as users
  from session_totals t
),
active_24h as (
  select count(distinct i.user_id)::bigint as users
  from public.usage_intervals i, params p
  where i.occurred_at >= p.as_of - interval '24 hours'
)
select jsonb_build_object(
  'signups_24h', (select count(*) from public.profiles where created_at >= now() - interval '24 hours'),
  'signups_7d', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
  'signups_30d', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
  'signups_total', (select count(*) from public.profiles),
  'active_users_24h', (select users from active_24h),
  'days', (select d from params),
  'sessions', (select sessions from sess),
  'active_users', (select users from sess),
  'avg_session_seconds', (select avg_seconds from sess),
  'sections', coalesce((select jsonb_agg(jsonb_build_object('section', section, 'seconds', seconds, 'visits', visits, 'users', users) order by seconds desc) from section_totals), '[]'::jsonb),
  'signups_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'count', c) order by day) from (
    select (created_at at time zone 'UTC')::date as day, count(*) as c
    from public.profiles where created_at >= now() - interval '14 days' group by 1
  ) x), '[]'::jsonb)
);
$$;
revoke all on function public.admin_usage_stats(integer) from public, anon, authenticated;
grant execute on function public.admin_usage_stats(integer) to service_role;
