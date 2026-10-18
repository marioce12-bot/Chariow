alter table public.meta_ad_accounts
  add column if not exists insights_sync_from date,
  add column if not exists insights_sync_to date,
  add column if not exists insights_sync_complete boolean default null;
