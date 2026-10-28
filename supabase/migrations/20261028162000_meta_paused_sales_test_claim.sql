create table public.meta_paused_sales_test_claims (
  test_key text primary key check (test_key = 'meta-paused-sales-whatsapp-status-preview-v1'),
  user_id uuid not null,
  claimed_at timestamptz not null default now()
);

alter table public.meta_paused_sales_test_claims enable row level security;
revoke all on public.meta_paused_sales_test_claims from public, anon, authenticated, service_role;
grant insert on public.meta_paused_sales_test_claims to service_role;
create policy "Service role may claim paused Meta test"
  on public.meta_paused_sales_test_claims
  for insert to service_role
  with check (true);
