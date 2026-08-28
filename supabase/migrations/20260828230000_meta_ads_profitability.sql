create table public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  meta_account_id text not null,
  name text,
  currency text not null default 'XOF',
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, meta_account_id)
);

create table public.meta_campaigns (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  meta_campaign_id text not null,
  name text not null,
  status text,
  objective text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ad_account_id, meta_campaign_id)
);

create table public.meta_adsets (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  meta_adset_id text not null,
  campaign_id uuid references public.meta_campaigns(id) on delete set null,
  name text not null,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ad_account_id, meta_adset_id)
);

create table public.meta_ads (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  meta_ad_id text not null,
  adset_id uuid references public.meta_adsets(id) on delete set null,
  name text not null,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ad_account_id, meta_ad_id)
);

create table public.meta_insights_daily (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  level text not null check (level in ('campaign', 'adset', 'ad')),
  entity_id text not null,
  entity_name text,
  date_start date not null,
  date_stop date not null,
  impressions integer not null default 0,
  reach integer not null default 0,
  clicks integer not null default 0,
  spend numeric(14,2) not null default 0,
  ctr numeric(10,4) not null default 0,
  cpc numeric(14,4) not null default 0,
  cpm numeric(14,4) not null default 0,
  conversions numeric(14,2) not null default 0,
  conversion_value numeric(14,2) not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ad_account_id, level, entity_id, date_start)
);

create table public.meta_attributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  sale_id text not null,
  product_id text,
  campaign_id text,
  adset_id text,
  ad_id text,
  attribution_method text not null check (attribution_method in ('utm', 'click_id', 'sale_metadata')),
  attributed_at timestamptz not null default now(),
  unique(user_id, store_id, sale_id)
);

create index meta_insights_account_date_idx on public.meta_insights_daily(ad_account_id, date_start desc);
create index meta_attributions_store_idx on public.meta_attributions(store_id, attributed_at desc);

create trigger meta_ad_accounts_updated_at before update on public.meta_ad_accounts for each row execute procedure public.set_updated_at();
create trigger meta_campaigns_updated_at before update on public.meta_campaigns for each row execute procedure public.set_updated_at();
create trigger meta_adsets_updated_at before update on public.meta_adsets for each row execute procedure public.set_updated_at();
create trigger meta_ads_updated_at before update on public.meta_ads for each row execute procedure public.set_updated_at();
create trigger meta_insights_updated_at before update on public.meta_insights_daily for each row execute procedure public.set_updated_at();

alter table public.meta_ad_accounts enable row level security;
alter table public.meta_campaigns enable row level security;
alter table public.meta_adsets enable row level security;
alter table public.meta_ads enable row level security;
alter table public.meta_insights_daily enable row level security;
alter table public.meta_attributions enable row level security;

create policy "Users can read their Meta accounts" on public.meta_ad_accounts for select using (auth.uid() = user_id);
create policy "Users can create their Meta accounts" on public.meta_ad_accounts for insert with check (auth.uid() = user_id);
create policy "Users can update their Meta accounts" on public.meta_ad_accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their Meta accounts" on public.meta_ad_accounts for delete using (auth.uid() = user_id);
create policy "Users can read their Meta campaigns" on public.meta_campaigns for select using (exists (select 1 from public.meta_ad_accounts a where a.id = ad_account_id and a.user_id = auth.uid()));
create policy "Users can read their Meta adsets" on public.meta_adsets for select using (exists (select 1 from public.meta_ad_accounts a where a.id = ad_account_id and a.user_id = auth.uid()));
create policy "Users can read their Meta ads" on public.meta_ads for select using (exists (select 1 from public.meta_ad_accounts a where a.id = ad_account_id and a.user_id = auth.uid()));
create policy "Users can read their Meta insights" on public.meta_insights_daily for select using (exists (select 1 from public.meta_ad_accounts a where a.id = ad_account_id and a.user_id = auth.uid()));
create policy "Users can read their Meta attributions" on public.meta_attributions for select using (auth.uid() = user_id);
