create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  transaction_id text,
  user_id uuid references public.profiles(id) on delete set null,
  plan public.subscription_plan,
  status text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table public.payment_events enable row level security;
