create table if not exists public.vendeo_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  alert_key text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  description text not null,
  status text not null default 'open' check (status in ('open', 'read', 'resolved')),
  dedupe_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(user_id, dedupe_key)
);

create index if not exists vendeo_alerts_user_status_idx on public.vendeo_alerts(user_id, status, created_at desc);
alter table public.vendeo_alerts enable row level security;
drop policy if exists "Users can read their Vendeo alerts" on public.vendeo_alerts;
create policy "Users can read their Vendeo alerts" on public.vendeo_alerts for select using (auth.uid() = user_id);
drop policy if exists "Users can update their Vendeo alerts" on public.vendeo_alerts;
create policy "Users can update their Vendeo alerts" on public.vendeo_alerts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
