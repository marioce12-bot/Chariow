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
    'Paramètres', 'Notifications', 'Bénéfices nets', 'Relances WhatsApp'
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
