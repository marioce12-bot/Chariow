-- Native Chariow campaign attribution.
-- Keeps legacy attribution tables intact for historical data, but new campaign
-- attribution no longer depends on visitor_id.
create table if not exists public.meta_campaign_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  meta_campaign_id text not null,
  meta_campaign_name text,
  chariow_campaign_id text not null,
  chariow_campaign_name text,
  mapping_level text not null default 'campaign' check (mapping_level in ('campaign','adset','ad')),
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, store_id, meta_campaign_id, chariow_campaign_id, mapping_level)
);

create index if not exists meta_campaign_mappings_meta_idx
  on public.meta_campaign_mappings(user_id, meta_campaign_id, status);
create index if not exists meta_campaign_mappings_chariow_idx
  on public.meta_campaign_mappings(user_id, store_id, chariow_campaign_id, status);

alter table public.meta_campaign_mappings enable row level security;
create policy "Users can read their campaign mappings"
  on public.meta_campaign_mappings for select using (auth.uid() = user_id);
create policy "Users can create their campaign mappings"
  on public.meta_campaign_mappings for insert with check (auth.uid() = user_id);
create policy "Users can update their campaign mappings"
  on public.meta_campaign_mappings for update using (auth.uid() = user_id);
create policy "Users can delete their campaign mappings"
  on public.meta_campaign_mappings for delete using (auth.uid() = user_id);

create trigger meta_campaign_mappings_updated_at
  before update on public.meta_campaign_mappings
  for each row execute procedure public.set_updated_at();

-- Fields populated from native Chariow campaign data returned by list_sales/get_sale.
alter table public.chariow_sales add column if not exists chariow_campaign_id text;
alter table public.chariow_sales add column if not exists chariow_campaign_name text;
create index if not exists chariow_sales_store_occurred_idx
  on public.chariow_sales(store_id, occurred_at desc);
create index if not exists chariow_sales_campaign_idx
  on public.chariow_sales(store_id, chariow_campaign_id);
