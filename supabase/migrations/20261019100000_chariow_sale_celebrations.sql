create table if not exists public.chariow_celebration_baselines (
  store_id uuid primary key references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  baseline_at timestamptz not null default now()
);
create table if not exists public.chariow_celebration_consumed (
  store_id uuid not null references public.stores(id) on delete cascade,
  sale_id text not null,
  occurred_at timestamptz not null,
  consumed_at timestamptz not null default now(),
  primary key (store_id, sale_id)
);
alter table public.chariow_celebration_baselines enable row level security;
alter table public.chariow_celebration_consumed enable row level security;

create or replace function public.consume_chariow_celebration_sales(p_user_id uuid, p_store_id uuid, p_candidates jsonb, p_observed_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_baseline timestamptz;
  v_count integer := 0;
  v_initialized boolean := false;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.user_id = p_user_id and s.platform = 'chariow' and s.is_active = true and s.connection_status = 'connected') then raise exception 'store access denied'; end if;
  insert into public.chariow_celebration_baselines(store_id, user_id, baseline_at)
  values (p_store_id, p_user_id, p_observed_at) on conflict (store_id) do nothing returning true into v_initialized;
  select b.baseline_at into v_baseline from public.chariow_celebration_baselines b where b.store_id = p_store_id for update;
  -- The first complete successful scan seeds its entire set of IDs as history.
  if coalesce(v_initialized, false) then
    insert into public.chariow_celebration_consumed(store_id, sale_id, occurred_at)
    select p_store_id, x.id, x.occurred_at
    from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as x(id text, occurred_at timestamptz)
    where x.id is not null and x.occurred_at is not null and x.occurred_at <= p_observed_at
    on conflict (store_id, sale_id) do nothing;
    return 0;
  end if;
  with valid as (
    select distinct on (x.id) x.id, x.occurred_at
    from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as x(id text, occurred_at timestamptz)
    where x.id is not null and x.occurred_at is not null and x.occurred_at >= v_baseline and x.occurred_at <= statement_timestamp()
    order by x.id, x.occurred_at
  ), inserted as (
    insert into public.chariow_celebration_consumed(store_id, sale_id, occurred_at)
    select p_store_id, valid.id, valid.occurred_at from valid
    on conflict (store_id, sale_id) do nothing returning 1
  ) select count(*)::integer into v_count from inserted;
  return v_count;
end;
$$;
revoke all on function public.consume_chariow_celebration_sales(uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.consume_chariow_celebration_sales(uuid, uuid, jsonb, timestamptz) to service_role;
