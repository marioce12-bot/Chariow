create table if not exists public.payment_recovery_cases (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
 customer_name text, phone text not null, email text, customer_id text, product_name text, amount numeric(14,2), currency text, payment_url text not null check(payment_url ~ '^https://[^[:space:]]+$'),
 abandoned_at timestamptz not null, consent_at timestamptz not null default now(), consent_source text not null check(length(trim(consent_source)) >= 3),
 status text not null default 'open' check(status in ('open','prepared','sent','recovered')),
 prepared_at timestamptz, sent_at timestamptz, sale_id text, attribution text check(attribution is null or attribution in ('confirmed','estimated')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status not in ('sent','recovered') or (sent_at is not null and prepared_at is not null)),
 check(status <> 'recovered' or (sale_id is not null and attribution is not null))
);
create index if not exists payment_recovery_store_status_idx on public.payment_recovery_cases(store_id,status,abandoned_at desc);
alter table public.payment_recovery_cases enable row level security;
create policy "Store owners manage payment recovery" on public.payment_recovery_cases for all using (exists(select 1 from public.stores s where s.id=store_id and s.user_id=auth.uid())) with check (exists(select 1 from public.stores s where s.id=store_id and s.user_id=auth.uid()));
