create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id text not null,
  platform text not null check (platform in ('meta', 'tiktok')),
  status text not null default 'draft' check (status in ('draft', 'account_required', 'submitting', 'review', 'active', 'paused', 'rejected', 'error', 'completed')),
  objective text not null check (objective in ('sales', 'traffic', 'engagement', 'leads')),
  ad_text text not null,
  title text,
  destination_url text not null,
  media_url text,
  countries text[] not null default '{}',
  min_age integer not null default 18,
  max_age integer not null default 65,
  daily_budget numeric(14,2) not null,
  duration_days integer not null,
  estimated_budget numeric(14,2) not null,
  external_campaign_id text,
  external_error text,
  meta_ad_account_id uuid references public.meta_ad_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (daily_budget >= 100),
  check (duration_days between 1 and 90),
  check (min_age between 13 and 65),
  check (max_age between min_age and 65)
);

create index if not exists ad_campaigns_user_idx on public.ad_campaigns(user_id, created_at desc);
create index if not exists ad_campaigns_store_idx on public.ad_campaigns(store_id, status);
alter table public.ad_campaigns enable row level security;
create policy "Users can read their ad campaigns" on public.ad_campaigns for select using (auth.uid() = user_id);
create policy "Users can create their ad campaigns" on public.ad_campaigns for insert with check (auth.uid() = user_id);
create policy "Users can update their ad campaigns" on public.ad_campaigns for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their ad campaigns" on public.ad_campaigns for delete using (auth.uid() = user_id);
create trigger ad_campaigns_updated_at before update on public.ad_campaigns for each row execute procedure public.set_updated_at();
