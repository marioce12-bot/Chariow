-- Suivi d'usage de l'app (temps passé par section) + statistiques admin (inscriptions, usage).
-- Les tables ne sont accessibles qu'avec la clé service_role (RLS activée, aucune policy).

create table if not exists public.usage_sessions (
  session_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  total_seconds integer not null default 0
);
create index if not exists usage_sessions_started_idx on public.usage_sessions(started_at desc);
create index if not exists usage_sessions_user_idx on public.usage_sessions(user_id, started_at desc);
create index if not exists usage_sessions_last_seen_idx on public.usage_sessions(last_seen_at desc);
alter table public.usage_sessions enable row level security;

create table if not exists public.usage_section_stats (
  session_id uuid not null references public.usage_sessions(session_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  section text not null,
  seconds integer not null default 0,
  visits integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (session_id, section)
);
create index if not exists usage_section_stats_updated_idx on public.usage_section_stats(updated_at desc);
create index if not exists usage_section_stats_section_idx on public.usage_section_stats(section, updated_at desc);
alter table public.usage_section_stats enable row level security;

-- Heartbeat envoyé par l'app : ajoute du temps à la session et à la section en cours.
create or replace function public.track_usage_heartbeat(p_user_id uuid, p_session_id uuid, p_section text, p_seconds integer, p_new_visit boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  secs integer := greatest(0, least(coalesce(p_seconds, 0), 60));
begin
  insert into public.usage_sessions(session_id, user_id, total_seconds)
  values (p_session_id, p_user_id, secs)
  on conflict (session_id) do update
    set last_seen_at = now(),
        total_seconds = public.usage_sessions.total_seconds + secs
    where public.usage_sessions.user_id = p_user_id;

  -- Une session appartenant à un autre utilisateur est ignorée.
  if not exists (select 1 from public.usage_sessions where session_id = p_session_id and user_id = p_user_id) then
    return;
  end if;

  insert into public.usage_section_stats(session_id, user_id, section, seconds, visits)
  values (p_session_id, p_user_id, p_section, secs, case when p_new_visit then 1 else 0 end)
  on conflict (session_id, section) do update
    set seconds = public.usage_section_stats.seconds + excluded.seconds,
        visits = public.usage_section_stats.visits + excluded.visits,
        updated_at = now();
end;
$$;
revoke all on function public.track_usage_heartbeat(uuid, uuid, text, integer, boolean) from public, anon, authenticated;

-- Statistiques pour la console admin.
create or replace function public.admin_usage_stats(p_days integer default 7)
returns jsonb language sql security definer set search_path = public as $$
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
  'signups_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'count', c) order by day) from (select (created_at at time zone 'UTC')::date as day, count(*) as c from public.profiles where created_at >= now() - interval '14 days' group by 1) x), '[]'::jsonb)
);
$$;
revoke all on function public.admin_usage_stats(integer) from public, anon, authenticated;
