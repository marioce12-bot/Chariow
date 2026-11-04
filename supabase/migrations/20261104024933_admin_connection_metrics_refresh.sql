-- Keep the admin dashboard metrics inside PostgreSQL: only four aggregate
-- values are returned to the application, never per-account/user rows.
create or replace function public.admin_connection_metrics()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with store_metrics as (
    select
      count(distinct user_id) as users_with_store,
      count(*) as connected_stores
    from public.stores
    where connection_status = 'connected'
      and is_active = true
  ),
  ad_account_metrics as (
    select
      count(distinct user_id) as users_with_ad_account,
      count(*) as connected_ad_accounts
    from (
      select user_id from public.meta_ad_accounts where is_active = true
      union all
      select user_id from public.tiktok_ad_accounts where is_active = true
      union all
      select user_id from public.pinterest_ad_accounts where is_active = true
      union all
      select user_id from public.reddit_ad_accounts where is_active = true
    ) as active_accounts
  )
  select jsonb_build_object(
    'users_with_store', store_metrics.users_with_store,
    'connected_stores', store_metrics.connected_stores,
    'users_with_ad_account', ad_account_metrics.users_with_ad_account,
    'connected_ad_accounts', ad_account_metrics.connected_ad_accounts
  )
  from store_metrics cross join ad_account_metrics;
$$;

revoke all on function public.admin_connection_metrics() from public, anon, authenticated;
grant execute on function public.admin_connection_metrics() to service_role;
notify pgrst, 'reload schema';
