-- Usage data is server-only. service_role bypasses RLS, but function EXECUTE
-- must still be granted explicitly after PUBLIC/anon/authenticated are revoked.
revoke all on table public.usage_sessions, public.usage_section_stats from public, anon, authenticated;
grant all on table public.usage_sessions, public.usage_section_stats to service_role;

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
begin
  -- Never permit a client-supplied section outside the Dashboard's known views.
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
    set last_seen_at = now(),
        total_seconds = public.usage_sessions.total_seconds + secs
    where public.usage_sessions.user_id = p_user_id;

  -- A globally unique session id cannot be reassigned to another user.
  if not exists (
    select 1 from public.usage_sessions
    where session_id = p_session_id and user_id = p_user_id
  ) then
    raise exception 'Usage session ownership mismatch';
  end if;

  insert into public.usage_section_stats(session_id, user_id, section, seconds, visits)
  values (p_session_id, p_user_id, p_section, secs, case when p_new_visit then 1 else 0 end)
  on conflict (session_id, section) do update
    set seconds = public.usage_section_stats.seconds + excluded.seconds,
        visits = public.usage_section_stats.visits + excluded.visits,
        updated_at = now();
end;
$$;

create or replace function public.admin_usage_stats(p_days integer default 7)
returns jsonb
language sql
security definer
set search_path = public
as $$
with params as (
  select greatest(1, least(coalesce(p_days, 7), 90)) as d
),
section_totals as (
  select s.section,
         sum(s.seconds)::bigint as seconds,
         sum(s.visits)::bigint as visits,
         count(distinct s.user_id)::bigint as users
  from public.usage_section_stats s, params p
  where s.updated_at >= now() - make_interval(days => p.d)
  group by s.section
),
sess as (
  select count(*)::bigint as sessions,
         coalesce(round(avg(u.total_seconds)), 0)::bigint as avg_seconds,
         count(distinct u.user_id)::bigint as users
  from public.usage_sessions u, params p
  where u.started_at >= now() - make_interval(days => p.d)
    and u.total_seconds > 0
)
select jsonb_build_object(
  'signups_24h', (select count(*) from public.profiles where created_at >= now() - interval '24 hours'),
  'signups_7d', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
  'signups_30d', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
  'signups_total', (select count(*) from public.profiles),
  'active_users_24h', (select count(distinct user_id) from public.usage_sessions where last_seen_at >= now() - interval '24 hours'),
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

revoke all on function public.track_usage_heartbeat(uuid, uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.track_usage_heartbeat(uuid, uuid, text, integer, boolean) to service_role;
revoke all on function public.admin_usage_stats(integer) from public, anon, authenticated;
grant execute on function public.admin_usage_stats(integer) to service_role;
