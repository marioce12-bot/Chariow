alter table public.meta_ad_accounts add column if not exists auto_sync_enabled boolean not null default true;
alter table public.meta_ad_accounts add column if not exists last_sync_error text;
create index if not exists meta_ad_accounts_auto_sync_idx on public.meta_ad_accounts(auto_sync_enabled, is_active, last_synced_at);
