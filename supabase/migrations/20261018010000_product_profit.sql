create table if not exists public.product_profit_costs (
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id text not null,
  currency text not null check (currency = upper(currency) and length(currency) between 3 and 8),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  fee_per_sale numeric(14,2) not null default 0 check (fee_per_sale >= 0),
  updated_at timestamptz not null default now(),
  primary key (store_id, product_id, currency)
);
create index if not exists product_profit_costs_store_idx on public.product_profit_costs(store_id);
alter table public.product_profit_costs enable row level security;
drop policy if exists "Store owners manage product profit costs" on public.product_profit_costs;
create policy "Store owners manage product profit costs" on public.product_profit_costs
  for all using (exists (select 1 from public.stores s where s.id = store_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.stores s where s.id = store_id and s.user_id = auth.uid()));
grant select, insert, update, delete on public.product_profit_costs to authenticated;
grant select, insert, update, delete on public.product_profit_costs to service_role;
