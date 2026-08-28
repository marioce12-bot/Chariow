create table public.meta_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  state_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index meta_oauth_states_user_idx on public.meta_oauth_states(user_id, expires_at);
alter table public.meta_oauth_states enable row level security;

create policy "Users can create their Meta OAuth states"
on public.meta_oauth_states
for insert
with check (auth.uid() = user_id);

create policy "Users can read their Meta OAuth states"
on public.meta_oauth_states
for select
using (auth.uid() = user_id);

create policy "Users can delete their Meta OAuth states"
on public.meta_oauth_states
for delete
using (auth.uid() = user_id);

create table public.meta_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  meta_user_id text not null,
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  is_active boolean not null default true,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, meta_user_id)
);

create index meta_integrations_user_idx on public.meta_integrations(user_id);
alter table public.meta_integrations enable row level security;
create policy "Users can read their Meta integrations" on public.meta_integrations for select using (auth.uid() = user_id);
create policy "Users can create their Meta integrations" on public.meta_integrations for insert with check (auth.uid() = user_id);
create policy "Users can update their Meta integrations" on public.meta_integrations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their Meta integrations" on public.meta_integrations for delete using (auth.uid() = user_id);
create trigger meta_integrations_updated_at before update on public.meta_integrations for each row execute procedure public.set_updated_at();

alter table public.meta_ad_accounts add column if not exists meta_integration_id uuid references public.meta_integrations(id) on delete cascade;
alter table public.meta_ad_accounts add column if not exists timezone_name text;
alter table public.meta_ad_accounts add column if not exists account_status integer;
alter table public.meta_ad_accounts add column if not exists is_selected boolean not null default true;
alter table public.meta_ad_accounts add column if not exists last_error text;

alter table public.meta_attributions add column if not exists chariow_sale_id text;
alter table public.meta_attributions add column if not exists utm_source text;
alter table public.meta_attributions add column if not exists utm_medium text;
alter table public.meta_attributions add column if not exists utm_campaign text;
alter table public.meta_attributions add column if not exists utm_content text;
alter table public.meta_attributions add column if not exists utm_term text;
alter table public.meta_attributions add column if not exists fbclid text;
alter table public.meta_attributions add column if not exists attribution_model text not null default 'last_non_direct_click';
alter table public.meta_attributions add column if not exists attribution_confidence numeric(5,2) not null default 0;
create index if not exists meta_attributions_chariow_sale_idx on public.meta_attributions(chariow_sale_id);
