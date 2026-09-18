create table if not exists public.market_signals (
  cache_key text primary key,
  provider text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists market_signals_provider_fetched_idx on public.market_signals(provider, fetched_at desc);

create table if not exists public.api_usage (
  provider text not null,
  month text not null,
  count integer not null default 0 check (count >= 0),
  primary key (provider, month)
);

alter table public.market_signals enable row level security;
alter table public.api_usage enable row level security;

create or replace function public.increment_api_usage(p_provider text, p_month text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare next_count integer;
begin
  insert into public.api_usage(provider, month, count)
  values (p_provider, p_month, 1)
  on conflict (provider, month)
  do update set count = public.api_usage.count + 1
  returning count into next_count;
  return next_count;
end;
$$;

revoke all on function public.increment_api_usage(text, text) from public;
grant execute on function public.increment_api_usage(text, text) to service_role;
