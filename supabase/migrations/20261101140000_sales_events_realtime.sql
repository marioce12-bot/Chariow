create table if not exists public.sales_events (
  event_id text not null,
  store_id uuid not null,
  user_id uuid not null,
  status text not null,
  amount numeric(14,2),
  currency text,
  product_id text,
  product_name text,
  created_at timestamptz not null default now(),
  constraint sales_events_store_event_unique unique (store_id, event_id),
  constraint sales_events_store_owner_fk foreign key (store_id, user_id)
    references public.stores(id, user_id) on delete cascade
);

create index if not exists sales_events_user_created_idx
  on public.sales_events(user_id, created_at desc);

alter table public.sales_events enable row level security;
revoke all on public.sales_events from public, anon, authenticated;
grant select on public.sales_events to authenticated;
drop policy if exists "Owners can read their sales events" on public.sales_events;
create policy "Owners can read their sales events"
  on public.sales_events for select to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.stores s
      where s.id = sales_events.store_id and s.user_id = auth.uid()
    )
  );

-- A missing publication must fail the migration rather than silently disabling Realtime.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Required publication supabase_realtime is missing';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sales_events'
  ) then
    alter publication supabase_realtime add table public.sales_events;
  end if;
end;
$$;
