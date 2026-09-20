create table if not exists public.platform_payouts (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.admin_users(id) on delete set null,
  provider text not null default 'saspay',
  provider_payout_id text unique,
  idempotency_key text not null unique,
  amount_xof numeric(12,2) not null check (amount_xof > 0),
  fee_xof numeric(12,2) not null default 0,
  net_amount_xof numeric(12,2) not null,
  recipient_name text not null,
  recipient_phone text not null,
  recipient_country text not null default 'BJ',
  recipient_method text not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','cancelled')),
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_payouts_status_idx on public.platform_payouts(status, created_at desc);
create index if not exists platform_payouts_created_idx on public.platform_payouts(created_at desc);
create trigger platform_payouts_updated_at before update on public.platform_payouts for each row execute procedure public.set_updated_at();
alter table public.platform_payouts enable row level security;
create policy "Admins can read platform payouts" on public.platform_payouts for select using (exists (select 1 from public.admin_users where user_id = auth.uid() and is_active = true));
