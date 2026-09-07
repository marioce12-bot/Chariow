create table public.campaign_product_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_campaign_id uuid not null references public.meta_campaigns(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  product_url text,
  confidence text not null default 'manual' check (confidence in ('certain', 'probable', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meta_campaign_id)
);

alter table public.campaign_product_links enable row level security;

create policy "Users manage their own campaign product links"
  on public.campaign_product_links
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index campaign_product_links_user_idx on public.campaign_product_links(user_id);
