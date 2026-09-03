create table public.tiktok_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  state_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index tiktok_oauth_states_user_idx on public.tiktok_oauth_states(user_id, expires_at);
alter table public.tiktok_oauth_states enable row level security;
create policy "Users can create their TikTok OAuth states" on public.tiktok_oauth_states for insert with check (auth.uid() = user_id);
create policy "Users can read their TikTok OAuth states" on public.tiktok_oauth_states for select using (auth.uid() = user_id);
create policy "Users can delete their TikTok OAuth states" on public.tiktok_oauth_states for delete using (auth.uid() = user_id);

create table public.tiktok_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_token_encrypted text not null,
  scope text[] not null default '{}',
  is_active boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);
alter table public.tiktok_integrations enable row level security;
create policy "Users can read their TikTok integration" on public.tiktok_integrations for select using (auth.uid() = user_id);
create policy "Users can create their TikTok integration" on public.tiktok_integrations for insert with check (auth.uid() = user_id);
create policy "Users can update their TikTok integration" on public.tiktok_integrations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their TikTok integration" on public.tiktok_integrations for delete using (auth.uid() = user_id);
create trigger tiktok_integrations_updated_at before update on public.tiktok_integrations for each row execute procedure public.set_updated_at();

-- Contrairement à Meta, un seul access_token TikTok couvre tous les advertiser_ids
-- autorisés par l'utilisateur : pas besoin de dupliquer le token par compte.
create table public.tiktok_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tiktok_integration_id uuid not null references public.tiktok_integrations(id) on delete cascade,
  tiktok_advertiser_id text not null,
  name text,
  currency text not null default 'XOF',
  status text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, tiktok_advertiser_id)
);
create index tiktok_ad_accounts_user_idx on public.tiktok_ad_accounts(user_id);
alter table public.tiktok_ad_accounts enable row level security;
create policy "Users can read their TikTok ad accounts" on public.tiktok_ad_accounts for select using (auth.uid() = user_id);
create policy "Users can create their TikTok ad accounts" on public.tiktok_ad_accounts for insert with check (auth.uid() = user_id);
create policy "Users can update their TikTok ad accounts" on public.tiktok_ad_accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their TikTok ad accounts" on public.tiktok_ad_accounts for delete using (auth.uid() = user_id);
create trigger tiktok_ad_accounts_updated_at before update on public.tiktok_ad_accounts for each row execute procedure public.set_updated_at();

alter table public.ad_campaigns add column if not exists tiktok_ad_account_id uuid references public.tiktok_ad_accounts(id) on delete set null;
create index if not exists ad_campaigns_tiktok_account_idx on public.ad_campaigns(tiktok_ad_account_id, status);
