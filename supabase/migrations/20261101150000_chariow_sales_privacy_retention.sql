-- Minimise les anciennes lignes Chariow sans modifier les payloads Shopify déjà
-- normalisés. Le ledger chariow_sales garde ses colonnes métier; son JSON ne garde
-- que l'identifiant d'événement, le propriétaire, le statut, les montants, le
-- produit et sa date.
alter table public.chariow_sales
  add column if not exists product_name text;

update public.chariow_sales cs
set product_id = coalesce(
      cs.product_id,
      nullif(cs.raw_payload->>'product_id', ''),
      nullif(cs.raw_payload #>> '{product,id}', ''),
      nullif(cs.raw_payload #>> '{data,product_id}', ''),
      nullif(cs.raw_payload #>> '{data,product,id}', '')
    ),
    product_name = coalesce(
      cs.product_name,
      nullif(cs.raw_payload->>'product_name', ''),
      nullif(cs.raw_payload #>> '{product,name}', ''),
      nullif(cs.raw_payload #>> '{product,title}', ''),
      nullif(cs.raw_payload #>> '{data,product_name}', ''),
      nullif(cs.raw_payload #>> '{data,product,name}', ''),
      nullif(cs.raw_payload #>> '{data,sale,product_name}', ''),
      nullif(cs.raw_payload #>> '{data,sale,product,name}', ''),
      nullif(cs.raw_payload #>> '{payload,product_name}', ''),
      nullif(cs.raw_payload #>> '{sale,product_name}', '')
    ),
    raw_payload = jsonb_strip_nulls(jsonb_build_object(
      'event_id', coalesce(
        nullif(cs.raw_payload->>'event_id', ''),
        nullif(cs.raw_payload->>'id', ''),
        nullif(cs.raw_payload->>'sale_id', ''),
        nullif(cs.raw_payload->>'order_id', ''),
        cs.chariow_sale_id
      ),
      'store_id', cs.store_id,
      'user_id', s.user_id,
      'status', cs.status,
      'amount', cs.amount,
      'currency', cs.currency,
      'product_id', coalesce(
        cs.product_id,
        nullif(cs.raw_payload->>'product_id', ''),
        nullif(cs.raw_payload #>> '{product,id}', ''),
        nullif(cs.raw_payload #>> '{data,product_id}', ''),
        nullif(cs.raw_payload #>> '{data,product,id}', '')
      ),
      'product_name', coalesce(
        cs.product_name,
        nullif(cs.raw_payload->>'product_name', ''),
        nullif(cs.raw_payload #>> '{product,name}', ''),
        nullif(cs.raw_payload #>> '{product,title}', ''),
        nullif(cs.raw_payload #>> '{data,product_name}', ''),
        nullif(cs.raw_payload #>> '{data,product,name}', ''),
        nullif(cs.raw_payload #>> '{data,sale,product_name}', ''),
        nullif(cs.raw_payload #>> '{data,sale,product,name}', ''),
        nullif(cs.raw_payload #>> '{payload,product_name}', ''),
        nullif(cs.raw_payload #>> '{sale,product_name}', '')
      ),
      'created_at', cs.occurred_at
    ))
from public.stores s
where cs.store_id = s.id
  and s.platform = 'chariow'::public.store_platform;

-- Orphaned records cannot be attributed safely. Erase their JSON rather than
-- retain a provider payload that might contain contact details or credentials.
update public.chariow_sales
set raw_payload = '{}'::jsonb
where store_id is null and raw_payload <> '{}'::jsonb;

-- Backfill the existing Realtime table before removing its obsolete sale_id.
alter table public.sales_events
  add column if not exists product_id text,
  add column if not exists product_name text;

alter table public.sales_events
  replica identity using index sales_events_store_event_unique;

update public.sales_events se
set user_id = s.user_id
from public.stores s
where se.store_id = s.id;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sales_events' and column_name = 'sale_id'
  ) then
    execute $backfill$
      update public.sales_events se
      set product_id = coalesce(se.product_id, cs.product_id),
          product_name = coalesce(se.product_name, cs.product_name),
          created_at = coalesce(cs.occurred_at, se.created_at)
      from public.chariow_sales cs
      where se.sale_id = cs.chariow_sale_id and se.store_id = cs.store_id
    $backfill$;
  end if;
end;
$$;

alter table public.sales_events drop column if exists sale_id;
create index if not exists sales_events_created_retention_idx
  on public.sales_events(created_at);
grant all on public.sales_events to service_role;

-- Resolve the owner and allowed business fields while the old payload is still
-- available, then drop every unapproved JSON or delivery metadata column.
alter table public.chariow_pulse_events
  add column if not exists user_id uuid,
  add column if not exists status text,
  add column if not exists amount numeric(14,2),
  add column if not exists currency text,
  add column if not exists product_id text,
  add column if not exists product_name text;

with payload_parts as (
  select e.event_id,
         e.store_id as existing_store_id,
         e.payload,
         coalesce(
           e.payload #> '{data,sale}',
           e.payload -> 'data',
           e.payload -> 'payload',
           e.payload -> 'sale',
           e.payload
         ) as sale,
         coalesce(
           e.payload #>> '{data,custom_metadata,store_id}',
           e.payload #>> '{data,metadata,store_id}',
           e.payload #>> '{custom_metadata,store_id}',
           e.payload #>> '{metadata,store_id}'
         ) as internal_store_id,
         coalesce(
           e.payload #>> '{data,store_id}',
           e.payload #>> '{data,store,id}',
           e.payload ->> 'store_id',
           e.payload #>> '{store,id}'
         ) as provider_store_id
  from public.chariow_pulse_events e
), resolved as (
  select p.event_id,
         s.id as store_id,
         s.user_id,
         coalesce(nullif(p.sale->>'status', ''), nullif(p.payload->>'type', ''), 'unknown') as status,
         case
           when coalesce(p.sale #>> '{amount,value}', p.sale->>'amount') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
             then coalesce(p.sale #>> '{amount,value}', p.sale->>'amount')::numeric(14,2)
           else cs.amount
         end as amount,
         coalesce(nullif(p.sale #>> '{amount,currency}', ''), nullif(p.sale->>'currency', ''), cs.currency) as currency,
         coalesce(nullif(p.sale->>'product_id', ''), nullif(p.sale #>> '{product,id}', ''), cs.product_id) as product_id,
         coalesce(nullif(p.sale->>'product_name', ''), nullif(p.sale #>> '{product,name}', ''), nullif(p.sale #>> '{product,title}', ''), cs.product_name) as product_name
  from payload_parts p
  join public.stores s
    on (s.id = p.existing_store_id
        or s.id::text = p.internal_store_id
        or s.chariow_store_id = p.provider_store_id)
   and s.platform = 'chariow'::public.store_platform
  left join public.chariow_sales cs
    on cs.store_id = s.id
   and cs.chariow_sale_id = coalesce(p.sale->>'id', p.sale->>'sale_id', p.sale->>'order_id')
)
update public.chariow_pulse_events e
set store_id = r.store_id,
    user_id = r.user_id,
    status = r.status,
    amount = r.amount,
    currency = r.currency,
    product_id = r.product_id,
    product_name = r.product_name
from resolved r
where e.event_id = r.event_id;

-- Remove unresolvable old records instead of keeping unidentified user data.
delete from public.chariow_pulse_events
where store_id is null or user_id is null;

alter table public.chariow_pulse_events
  alter column store_id set not null,
  alter column user_id set not null,
  alter column status set not null;

alter table public.chariow_pulse_events
  drop constraint if exists chariow_pulse_events_store_id_fkey,
  drop constraint if exists chariow_pulse_events_pkey,
  drop constraint if exists chariow_pulse_events_event_id_key;

drop index if exists public.chariow_pulse_events_pulse_delivery_id_unique_idx;
drop index if exists public.chariow_pulse_events_delivery_unique_idx;
drop index if exists public.chariow_pulse_events_pulse_delivery_id_idx;
drop index if exists public.chariow_pulse_events_delivery_idx;

alter table public.chariow_pulse_events
  drop column if exists id,
  drop column if exists event_type,
  drop column if exists payload,
  drop column if exists processed_at,
  drop column if exists pulse_delivery_id;

alter table public.chariow_pulse_events
  add constraint chariow_pulse_events_pkey primary key (event_id),
  add constraint chariow_pulse_events_store_owner_fk
    foreign key (store_id, user_id) references public.stores(id, user_id) on delete cascade;

create index if not exists chariow_pulse_events_created_retention_idx
  on public.chariow_pulse_events(created_at);
alter table public.chariow_pulse_events enable row level security;
revoke all on public.chariow_pulse_events from public, anon, authenticated;
grant all on public.chariow_pulse_events to service_role;

-- Realtime clients can only read their own events; server writes stay service-role-only.
alter table public.sales_events enable row level security;
revoke all on public.sales_events from public, anon, authenticated;
grant select on public.sales_events to authenticated;
grant all on public.sales_events to service_role;
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

create or replace function public.purge_chariow_sales_retention()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_sales_events integer := 0;
  deleted_pulse_events integer := 0;
  cleared_sale_payloads integer := 0;
begin
  delete from public.sales_events
  where created_at < now() - interval '90 days';
  get diagnostics deleted_sales_events = row_count;

  delete from public.chariow_pulse_events
  where created_at < now() - interval '90 days';
  get diagnostics deleted_pulse_events = row_count;

  update public.chariow_sales cs
  set raw_payload = '{}'::jsonb
  from public.stores s
  where cs.store_id = s.id
    and s.platform = 'chariow'::public.store_platform
    and coalesce(cs.occurred_at, cs.first_seen_at) < now() - interval '90 days'
    and cs.raw_payload <> '{}'::jsonb;
  get diagnostics cleared_sale_payloads = row_count;

  return jsonb_build_object(
    'sales_events_deleted', deleted_sales_events,
    'pulse_events_deleted', deleted_pulse_events,
    'old_sale_payloads_cleared', cleared_sale_payloads
  );
end;
$$;
revoke all on function public.purge_chariow_sales_retention() from public, anon, authenticated;
grant execute on function public.purge_chariow_sales_retention() to service_role;

-- Apply the retention boundary immediately, including data already stored.
select public.purge_chariow_sales_retention();

-- Supabase Cron/pg_cron runs the idempotent purge daily at 03:17 UTC.
create extension if not exists pg_cron;
do $$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job where jobname = 'chariow-sales-retention-90d'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
  perform cron.schedule(
    'chariow-sales-retention-90d',
    '17 3 * * *',
    'select public.purge_chariow_sales_retention();'
  );
end;
$$;
