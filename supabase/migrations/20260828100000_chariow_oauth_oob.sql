-- Chariow OAuth2 + PKCE (state/code_verifier temporaires + tokens chiffrés)

-- 1) Make sure connection_status supports future states.
--    If the constraint already exists, drop and recreate it to guarantee the expected values.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'stores_connection_status_check') then
    alter table public.stores drop constraint stores_connection_status_check;
  end if;
  alter table public.stores
    add constraint stores_connection_status_check
    check (connection_status in ('pending','connected','failed','expired','revoked'));
end $$;

-- 2) OAuth-related columns on stores.
alter table public.stores
  add column if not exists chariow_store_id text,
  add column if not exists token_type text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists connected_scopes text[],
  add column if not exists last_verified_at timestamptz;

-- 3) Remove old data requirement: mcp_url xor access_token is no longer sufficient.
--    Allow storing either mcp_url or encrypted token (or none during OAuth pending).
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'stores_connection_data_check'
  ) then
    alter table public.stores drop constraint stores_connection_data_check;
  end if;
end $$;

-- 4) Temporary OAuth attempts: state + PKCE code_verifier, bound to a user.
create table if not exists public.oauth_connection_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform public.store_platform not null default 'chariow',
  state text not null unique,
  store_id uuid references public.stores(id) on delete cascade,
  code_verifier_encrypted text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists oauth_connection_attempts_user_id_idx on public.oauth_connection_attempts(user_id);
create index if not exists oauth_connection_attempts_store_id_idx on public.oauth_connection_attempts(store_id);
create index if not exists oauth_connection_attempts_expires_at_idx on public.oauth_connection_attempts(expires_at);

-- RLS for OAuth attempts: user can only manage its own temporary state.
alter table public.oauth_connection_attempts enable row level security;

drop policy if exists "oauth_attempts_insert_own" on public.oauth_connection_attempts;
create policy "oauth_attempts_insert_own"
  on public.oauth_connection_attempts
  for insert
  with check (user_id = auth.uid());

drop policy if exists "oauth_attempts_select_own" on public.oauth_connection_attempts;
create policy "oauth_attempts_select_own"
  on public.oauth_connection_attempts
  for select
  using (user_id = auth.uid());

drop policy if exists "oauth_attempts_delete_own" on public.oauth_connection_attempts;
create policy "oauth_attempts_delete_own"
  on public.oauth_connection_attempts
  for delete
  using (user_id = auth.uid());
