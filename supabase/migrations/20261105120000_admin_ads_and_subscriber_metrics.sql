-- Statistiques admin : publicités lancées via Vendeo (total + actives sur une période)
-- et abonnés en cours.
--
-- ad_campaigns n'avait aucune date de lancement fiable : created_at est la date de
-- création du brouillon, updated_at change à chaque synchro de statut. On ajoute
-- launched_at, posé une seule fois par trigger au premier envoi réussi à la plateforme
-- publicitaire (identifiant externe ou statut "lancé").
alter table public.ad_campaigns
  add column if not exists launched_at timestamptz;

create or replace function public.set_ad_campaign_launched_at()
returns trigger language plpgsql as $$
begin
  if new.launched_at is null and (
    new.external_campaign_id is not null
    or new.status in ('review', 'preparing', 'unknown', 'active', 'paused', 'autopilot_paused', 'rejected', 'completed', 'archived', 'deleted')
  ) then
    new.launched_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists ad_campaigns_launched_at on public.ad_campaigns;
create trigger ad_campaigns_launched_at
  before insert or update on public.ad_campaigns
  for each row execute procedure public.set_ad_campaign_launched_at();

-- Rattrapage des campagnes déjà lancées : la date exacte n'a pas été conservée,
-- created_at est la meilleure approximation disponible (borne basse).
update public.ad_campaigns
set launched_at = created_at
where launched_at is null
  and (
    external_campaign_id is not null
    or status in ('review', 'preparing', 'unknown', 'active', 'paused', 'autopilot_paused', 'rejected', 'completed', 'archived', 'deleted')
  );

create index if not exists ad_campaigns_launched_idx on public.ad_campaigns(launched_at desc) where launched_at is not null;

-- p_start null = depuis le début. p_end est inclus.
-- Une campagne est "active sur la période" quand sa fenêtre de diffusion
-- [launched_at, fin] chevauche la période, avec fin = launched_at + duration_days,
-- ramenée à updated_at si elle a été mise en pause / archivée / supprimée avant terme.
-- Les campagnes refusées (rejected) ou en erreur n'ont jamais diffusé : exclues.
create or replace function public.admin_ads_metrics(p_start timestamptz default null, p_end timestamptz default now())
returns jsonb language sql stable security definer set search_path = public as $$
with launched as (
  select
    c.id, c.platform, c.status, c.launched_at, c.user_id,
    c.launched_at + make_interval(days => c.duration_days) as planned_end,
    case
      when c.status in ('paused', 'autopilot_paused', 'archived', 'deleted')
        then least(c.launched_at + make_interval(days => c.duration_days), greatest(c.updated_at, c.launched_at))
      else c.launched_at + make_interval(days => c.duration_days)
    end as window_end
  from public.ad_campaigns c
  where c.launched_at is not null
),
in_period as (
  select * from launched
  where status not in ('rejected', 'error')
    and launched_at <= p_end
    and (p_start is null or window_end >= p_start)
)
select jsonb_build_object(
  'total_launched', (select count(*) from launched),
  'total_launched_users', (select count(distinct user_id) from launched),
  'active_now', (select count(*) from public.ad_campaigns where status = 'active'),
  'launched_in_period', (select count(*) from launched where launched_at <= p_end and (p_start is null or launched_at >= p_start)),
  'active_in_period', (select count(*) from in_period),
  'by_platform', coalesce((select jsonb_object_agg(platform, n) from (select platform, count(*) as n from launched group by platform) x), '{}'::jsonb),
  'active_in_period_by_platform', coalesce((select jsonb_object_agg(platform, n) from (select platform, count(*) as n from in_period group by platform) x), '{}'::jsonb),
  'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) as n from launched group by status) x), '{}'::jsonb)
);
$$;

revoke all on function public.admin_ads_metrics(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_ads_metrics(timestamptz, timestamptz) to service_role;
