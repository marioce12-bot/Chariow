create table if not exists public.web_push_config (
  id integer primary key check (id = 1),
  public_key text not null,
  private_key_encrypted text not null,
  created_at timestamptz not null default now()
);

alter table public.web_push_config enable row level security;
revoke all on public.web_push_config from anon, authenticated;
-- No client policies: access is exclusively through the server service-role client.

grant all on public.web_push_config to service_role;

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint_hash text not null unique check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  endpoint text not null,
  subscription_encrypted text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists web_push_subscriptions_user_id_idx on public.web_push_subscriptions(user_id, id);
alter table public.web_push_subscriptions enable row level security;
revoke all on public.web_push_subscriptions from anon, authenticated;
-- No client policies or writes; API handlers use service_role and enforce ownership.
grant all on public.web_push_subscriptions to service_role;
