-- Approximation historique: l'horodatage réel de lancement n'était pas stocké;
-- paid_at (ou created_at si absent) sert de meilleur proxy disponible.
alter table public.ad_campaigns
  add column if not exists launched_at timestamptz;
create index if not exists ad_campaigns_launched_at_idx
  on public.ad_campaigns (launched_at);
update public.ad_campaigns
set launched_at = coalesce(paid_at, created_at)
where external_campaign_id is not null and launched_at is null;

create or replace function public.set_ad_campaign_launched_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.external_campaign_id is not null and
     (tg_op = 'INSERT' or old.external_campaign_id is null) then
    new.launched_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists ad_campaigns_set_launched_at on public.ad_campaigns;
create trigger ad_campaigns_set_launched_at
before insert or update of external_campaign_id on public.ad_campaigns
for each row execute function public.set_ad_campaign_launched_at();

create or replace function public.admin_ads_stats(p_start timestamptz, p_end timestamptz)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with launched as (
    select * from public.ad_campaigns where external_campaign_id is not null
  )
  select jsonb_build_object(
    'total_launched', (select count(*) from launched),
    'by_platform', jsonb_build_object(
      'meta', (select count(*) from launched where platform = 'meta'),
      'tiktok', (select count(*) from launched where platform = 'tiktok'),
      'pinterest', (select count(*) from launched where platform = 'pinterest')
    ),
    'running_now', (select count(*) from launched where status in ('review', 'active')),
    'launched_in_period', (select count(*) from launched where launched_at <= p_end and (p_start is null or launched_at >= p_start)),
    'active_in_period', (select count(*) from launched where launched_at <= p_end
      and launched_at + make_interval(days => duration_days) >= coalesce(p_start, '-infinity'::timestamptz)
      and status not in ('rejected', 'error', 'deleted', 'draft')),
    'users_with_launch', (select count(distinct user_id) from launched)
  );
$$;
revoke all on function public.admin_ads_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_ads_stats(timestamptz, timestamptz) to service_role;
