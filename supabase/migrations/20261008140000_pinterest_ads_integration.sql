create table if not exists public.pinterest_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  state_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists pinterest_oauth_states_user_idx on public.pinterest_oauth_states(user_id, expires_at);
alter table public.pinterest_oauth_states enable row level security;
create policy "Users can manage their Pinterest OAuth states" on public.pinterest_oauth_states for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.pinterest_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pinterest_user_id text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scope text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, pinterest_user_id)
);
alter table public.pinterest_integrations enable row level security;
create policy "Users can manage their Pinterest integrations" on public.pinterest_integrations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger pinterest_integrations_updated_at before update on public.pinterest_integrations for each row execute procedure public.set_updated_at();

create table if not exists public.pinterest_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pinterest_integration_id uuid not null references public.pinterest_integrations(id) on delete cascade,
  pinterest_ad_account_id text not null,
  name text,
  currency text not null default 'USD',
  country text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, pinterest_ad_account_id)
);
alter table public.pinterest_ad_accounts enable row level security;
create policy "Users can manage their Pinterest ad accounts" on public.pinterest_ad_accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger pinterest_ad_accounts_updated_at before update on public.pinterest_ad_accounts for each row execute procedure public.set_updated_at();

alter table public.ad_campaigns drop constraint if exists ad_campaigns_platform_check;
alter table public.ad_campaigns add constraint ad_campaigns_platform_check check (platform in ('meta', 'tiktok', 'pinterest'));
alter table public.ad_campaigns add column if not exists pinterest_ad_account_id uuid references public.pinterest_ad_accounts(id) on delete set null;
create index if not exists ad_campaigns_pinterest_account_idx on public.ad_campaigns(pinterest_ad_account_id, status);
