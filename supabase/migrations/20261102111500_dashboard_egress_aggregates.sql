-- Egress reduction: aggregate dashboard reads inside Postgres.
-- This migration is intentionally prepared locally only; do not apply remotely
-- until the API callers and output parity have been validated in Preview.

create or replace function public.dashboard_sales_daily(
  p_store_id uuid,
  p_from date,
  p_to date
)
returns table (
  day date,
  confirmed_sales bigint,
  gross_revenue numeric,
  net_revenue numeric,
  refunds bigint,
  customer_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (s.occurred_at at time zone 'UTC')::date as day,
    count(*) filter (where lower(coalesce(s.status, '')) in ('completed', 'settled', 'paid', 'succeeded', 'success'))::bigint as confirmed_sales,
    coalesce(sum(s.amount) filter (where lower(coalesce(s.status, '')) in ('completed', 'settled', 'paid', 'succeeded', 'success')), 0)::numeric as gross_revenue,
    coalesce(sum(s.net_amount) filter (where lower(coalesce(s.status, '')) in ('completed', 'settled', 'paid', 'succeeded', 'success')), 0)::numeric as net_revenue,
    count(*) filter (where lower(coalesce(s.status, '')) ~ 'refund|chargeback')::bigint as refunds,
    count(distinct s.customer_id) filter (where s.customer_id is not null and lower(coalesce(s.status, '')) in ('completed', 'settled', 'paid', 'succeeded', 'success'))::bigint as customer_count
  from public.chariow_sales s
  where s.store_id = p_store_id
    and s.occurred_at >= p_from::timestamptz
    and s.occurred_at < (p_to + 1)::timestamptz
    and exists (
      select 1 from public.stores st
      where st.id = s.store_id and st.user_id = auth.uid()
    )
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_sales_daily(uuid, date, date) to authenticated;

create or replace function public.dashboard_meta_campaign_daily(
  p_ad_account_id uuid,
  p_from date,
  p_to date
)
returns table (
  entity_id text,
  entity_name text,
  impressions bigint,
  clicks bigint,
  spend numeric,
  conversions numeric,
  conversion_value numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    i.entity_id,
    max(i.entity_name) as entity_name,
    coalesce(sum(i.impressions), 0)::bigint as impressions,
    coalesce(sum(i.clicks), 0)::bigint as clicks,
    coalesce(sum(i.spend), 0)::numeric as spend,
    coalesce(sum(i.conversions), 0)::numeric as conversions,
    coalesce(sum(i.conversion_value), 0)::numeric as conversion_value
  from public.meta_insights_daily i
  join public.meta_ad_accounts a on a.id = i.ad_account_id
  where i.ad_account_id = p_ad_account_id
    and i.level = 'campaign'
    and i.date_start between p_from and p_to
    and a.user_id = auth.uid()
  group by i.entity_id;
$$;

grant execute on function public.dashboard_meta_campaign_daily(uuid, date, date) to authenticated;

create or replace function public.dashboard_attribution_summary(
  p_store_id uuid,
  p_from date,
  p_to date
)
returns table (
  meta_campaign_id text,
  attributed_sales bigint,
  attributed_gross_revenue numeric,
  attributed_net_revenue numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.meta_campaign_id,
    count(*) filter (where lower(coalesce(a.sale_status, '')) in ('completed', 'settled', 'paid', 'succeeded', 'success'))::bigint as attributed_sales,
    coalesce(sum(a.attributed_gross_revenue) filter (where lower(coalesce(a.sale_status, '')) in ('completed', 'settled', 'paid', 'succeeded', 'success')), 0)::numeric as attributed_gross_revenue,
    coalesce(sum(a.attributed_net_revenue) filter (where lower(coalesce(a.sale_status, '')) in ('completed', 'settled', 'paid', 'succeeded', 'success')), 0)::numeric as attributed_net_revenue
  from public.meta_attributions a
  where a.store_id = p_store_id
    and a.meta_campaign_id is not null
    and a.attributed_at >= p_from::timestamptz
    and a.attributed_at < (p_to + 1)::timestamptz
    and a.user_id = auth.uid()
  group by a.meta_campaign_id;
$$;

grant execute on function public.dashboard_attribution_summary(uuid, date, date) to authenticated;
