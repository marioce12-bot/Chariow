create table if not exists public.chariow_sales (
  id uuid primary key default gen_random_uuid(),
  chariow_sale_id text not null unique,
  store_id uuid references public.stores(id) on delete cascade,
  product_id text,
  status text not null,
  amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  currency text,
  settlement_done boolean not null default false,
  event_type text,
  first_seen_at timestamptz not null default now(),
  occurred_at timestamptz,
  updated_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists chariow_sales_store_occurred_idx on public.chariow_sales(store_id, occurred_at desc);
create index if not exists chariow_sales_status_idx on public.chariow_sales(store_id, status, occurred_at desc);
alter table public.chariow_sales enable row level security;
drop policy if exists "Users can read their Chariow sales" on public.chariow_sales;
create policy "Users can read their Chariow sales" on public.chariow_sales for select using (exists (select 1 from public.stores s where s.id = store_id and s.user_id = auth.uid()));
