-- X Ads API (OAuth 1.0a user context)
create table if not exists public.x_ads_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  state_hash text not null,
  request_token text not null,
  request_token_secret_encrypted text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists x_ads_oauth_states_user_idx on public.x_ads_oauth_states(user_id, expires_at);
alter table public.x_ads_oauth_states enable row level security;
create policy "Users can create their X Ads OAuth states" on public.x_ads_oauth_states for insert with check (auth.uid() = user_id);
create policy "Users can read their X Ads OAuth states" on public.x_ads_oauth_states for select using (auth.uid() = user_id);
create policy "Users can delete their X Ads OAuth states" on public.x_ads_oauth_states for delete using (auth.uid() = user_id);

create table if not exists public.x_ads_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  x_user_id text not null,
  x_screen_name text,
  access_token_encrypted text not null,
  access_token_secret_encrypted text not null,
  granted_permissions text[] not null default '{}',
  is_active boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, x_user_id)
);
alter table public.x_ads_integrations enable row level security;
create policy "Users can read their X Ads integrations" on public.x_ads_integrations for select using (auth.uid() = user_id);
create policy "Users can create their X Ads integrations" on public.x_ads_integrations for insert with check (auth.uid() = user_id);
create policy "Users can update their X Ads integrations" on public.x_ads_integrations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their X Ads integrations" on public.x_ads_integrations for delete using (auth.uid() = user_id);
create trigger x_ads_integrations_updated_at before update on public.x_ads_integrations for each row execute procedure public.set_updated_at();

create table if not exists public.x_ads_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  x_ads_integration_id uuid not null references public.x_ads_integrations(id) on delete cascade,
  x_account_id text not null,
  name text,
  currency text not null default 'XOF',
  timezone text,
  approval_status text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, x_account_id)
);
create index if not exists x_ads_accounts_user_idx on public.x_ads_accounts(user_id);
alter table public.x_ads_accounts enable row level security;
create policy "Users can read their X Ads accounts" on public.x_ads_accounts for select using (auth.uid() = user_id);
create policy "Users can create their X Ads accounts" on public.x_ads_accounts for insert with check (auth.uid() = user_id);
create policy "Users can update their X Ads accounts" on public.x_ads_accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their X Ads accounts" on public.x_ads_accounts for delete using (auth.uid() = user_id);
create trigger x_ads_accounts_updated_at before update on public.x_ads_accounts for each row execute procedure public.set_updated_at();
