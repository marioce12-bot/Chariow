-- Private Shopify integration metadata. Do not change Chariow connection constraints.
alter table public.stores add column if not exists shop_domain text;
alter table public.stores add constraint stores_shop_domain_check check (
  platform <> 'shopify' or shop_domain is null or shop_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.myshopify\.com$'
);
create unique index if not exists stores_user_shopify_domain_unique
  on public.stores(user_id, shop_domain) where platform = 'shopify' and shop_domain is not null;
alter table public.stores add constraint stores_id_user_id_unique unique (id, user_id);
create table public.shopify_connections (
  store_id uuid primary key references public.stores(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  shop text not null check (shop ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.myshopify\.com$'),
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  scopes text[] not null,
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint shopify_connections_store_owner_fk foreign key (store_id, user_id)
    references public.stores(id, user_id) on delete cascade
);
create index shopify_connections_user_idx on public.shopify_connections(user_id);
create index shopify_connections_expiry_idx on public.shopify_connections(access_token_expires_at);
alter table public.shopify_connections enable row level security;
revoke all on public.shopify_connections from anon, authenticated;
-- One-use OAuth nonce, consumed atomically before code exchange.
create table public.shopify_oauth_states (
  nonce_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null,
  shop text not null,
  expires_at timestamptz not null,
  foreign key (store_id, user_id) references public.stores(id,user_id) on delete cascade
);
create index shopify_oauth_states_expiry_idx on public.shopify_oauth_states(expires_at);
alter table public.shopify_oauth_states enable row level security;
revoke all on public.shopify_oauth_states from anon, authenticated;
