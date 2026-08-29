create table public.attribution_touches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  visitor_id text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  landing_url text,
  captured_at timestamptz not null default now(),
  unique(user_id, visitor_id)
);

create table public.chariow_pulse_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.meta_attributions add column if not exists attributed_revenue numeric(14,2);
alter table public.meta_attributions add column if not exists currency text;

create index attribution_touches_visitor_idx on public.attribution_touches(visitor_id, captured_at desc);
alter table public.attribution_touches enable row level security;
alter table public.chariow_pulse_events enable row level security;
create policy "Users can read their attribution touches" on public.attribution_touches for select using (auth.uid() = user_id);
