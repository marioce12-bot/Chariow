create table if not exists public.webhook_failures (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event text,
  transaction_id text,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  resolved_at timestamptz,
  resolution_note text
);

create unique index if not exists webhook_failures_provider_transaction_reason_uidx
  on public.webhook_failures (provider, coalesce(transaction_id, ''), reason);
create index if not exists webhook_failures_unresolved_recent_idx
  on public.webhook_failures (last_seen_at desc)
  where resolved_at is null;

alter table public.webhook_failures enable row level security;
revoke all on table public.webhook_failures from public, anon, authenticated;
grant all on table public.webhook_failures to service_role;

create or replace function public.record_webhook_failure(
  p_provider text,
  p_event text,
  p_transaction_id text,
  p_reason text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.webhook_failures (
    provider, event, transaction_id, reason, payload
  ) values (
    p_provider, p_event, p_transaction_id, p_reason, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider, (coalesce(transaction_id, '')), reason)
  do update set
    event = excluded.event,
    payload = excluded.payload,
    last_seen_at = now(),
    attempts = public.webhook_failures.attempts + 1;
end;
$$;

revoke all on function public.record_webhook_failure(text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_webhook_failure(text, text, text, text, jsonb)
  to service_role;
