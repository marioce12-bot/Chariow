create table public.reddit_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  state_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index reddit_oauth_states_user_idx on public.reddit_oauth_states(user_id, expires_at);
alter table public.reddit_oauth_states enable row level security;
create policy "Users can create their Reddit OAuth states" on public.reddit_oauth_states for insert with check (auth.uid() = user_id);
create policy "Users can read their Reddit OAuth states" on public.reddit_oauth_states for select using (auth.uid() = user_id);
create policy "Users can delete their Reddit OAuth states" on public.reddit_oauth_states for delete using (auth.uid() = user_id);

create table public.reddit_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  scope text[] not null default '{}',
  is_active boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);
alter table public.reddit_integrations enable row level security;
create policy "Users can read their Reddit integration" on public.reddit_integrations for select using (auth.uid() = user_id);
create policy "Users can create their Reddit integration" on public.reddit_integrations for insert with check (auth.uid() = user_id);
create policy "Users can update their Reddit integration" on public.reddit_integrations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their Reddit integration" on public.reddit_integrations for delete using (auth.uid() = user_id);
create trigger reddit_integrations_updated_at before update on public.reddit_integrations for each row execute procedure public.set_updated_at();

-- admin_approval_status vient directement de l'API Reddit (champ "admin_approval" sur
-- l'objet ad_account) : c'est la preuve empirique qu'on va utiliser pour trancher le
-- débat "faut-il un partner-level access pour créer des campagnes ou pas".
create table public.reddit_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reddit_integration_id uuid not null references public.reddit_integrations(id) on delete cascade,
  reddit_business_id text not null,
  reddit_ad_account_id text not null,
  name text,
  currency text not null default 'XOF',
  admin_approval_status text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, reddit_ad_account_id)
);
create index reddit_ad_accounts_user_idx on public.reddit_ad_accounts(user_id);
alter table public.reddit_ad_accounts enable row level security;
create policy "Users can read their Reddit ad accounts" on public.reddit_ad_accounts for select using (auth.uid() = user_id);
create policy "Users can create their Reddit ad accounts" on public.reddit_ad_accounts for insert with check (auth.uid() = user_id);
create policy "Users can update their Reddit ad accounts" on public.reddit_ad_accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their Reddit ad accounts" on public.reddit_ad_accounts for delete using (auth.uid() = user_id);
create trigger reddit_ad_accounts_updated_at before update on public.reddit_ad_accounts for each row execute procedure public.set_updated_at();

alter table public.ad_campaigns add column if not exists reddit_ad_account_id uuid references public.reddit_ad_accounts(id) on delete set null;
create index if not exists ad_campaigns_reddit_account_idx on public.ad_campaigns(reddit_ad_account_id, status);
