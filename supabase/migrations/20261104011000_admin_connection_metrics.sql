create or replace function public.admin_connection_metrics()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'users_with_store', (select count(distinct user_id) from public.stores where connection_status = 'connected' and is_active = true),
    'connected_stores', (select count(*) from public.stores where connection_status = 'connected' and is_active = true),
    'users_with_ad_account', (select count(distinct user_id) from (
      select user_id from public.meta_ad_accounts where is_active = true
      union select user_id from public.tiktok_ad_accounts where is_active = true
      union select user_id from public.pinterest_ad_accounts where is_active = true
      union select user_id from public.reddit_ad_accounts where is_active = true
    ) accounts),
    'connected_ad_accounts', (select count(*) from (
      select id from public.meta_ad_accounts where is_active = true
      union all select id from public.tiktok_ad_accounts where is_active = true
      union all select id from public.pinterest_ad_accounts where is_active = true
      union all select id from public.reddit_ad_accounts where is_active = true
    ) accounts)
  );
$$;

revoke all on function public.admin_connection_metrics() from public, anon, authenticated;
grant execute on function public.admin_connection_metrics() to service_role;
