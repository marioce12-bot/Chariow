-- Unknown order dates are never treated as expired. Start their clock at the
-- actual first observation recorded here, not at an invented historical date.
alter table public.chariow_sales add column if not exists shopify_first_observed_at timestamptz;
update public.chariow_sales cs set shopify_first_observed_at = now()
from public.stores s
where cs.store_id = s.id and s.platform = 'shopify'
  and cs.shopify_first_observed_at is null;

create table if not exists public.shopify_order_redactions (
  shop_domain text not null,
  order_id_hash text not null check (order_id_hash ~ '^[0-9a-f]{64}$'),
  redacted_at timestamptz not null default now(),
  primary key (shop_domain, order_id_hash)
);
alter table public.shopify_order_redactions enable row level security;
revoke all on table public.shopify_order_redactions from public, anon, authenticated;
grant all on table public.shopify_order_redactions to service_role;

create or replace function public.shopify_canonical_order_id(p_value text) returns text
language sql immutable strict as $$ select (regexp_match(p_value, '^gid://shopify/Order/([1-9][0-9]*)$'))[1] $$;
create or replace function public.shopify_retention_lock(p_domain text, p_id text) returns void
language sql volatile as $$ select pg_advisory_xact_lock(hashtextextended(p_domain || ':' || p_id, 0)) $$;

create or replace function public.guard_shopify_sale_retention() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_domain text; v_id text; v_expected text;
begin
  select s.shop_domain into v_domain from public.stores s where s.id = new.store_id and s.platform = 'shopify';
  -- Chariow and all other platforms are unaffected, even where IDs share this prefix.
  if not found then return new; end if;
  -- Revocation/shop redaction can clear the domain while an import is in flight.
  if v_domain is null or v_domain !~ '^([a-z0-9-]+\.)*myshopify\.com$' then return null; end if;
  v_id := substring(new.chariow_sale_id from '^shopify:[^:]+:([1-9][0-9]*)$');
  v_expected := 'shopify:' || new.store_id::text || ':' || coalesce(v_id, '');
  -- Every Shopify sale must use its exact store-scoped key and a canonical positive order ID.
  if v_id is null or length(v_id) > 30 or new.chariow_sale_id <> v_expected then return null; end if;
  -- Ignore caller-supplied clocks; preserve the real first observation on upsert.
  if TG_OP = 'UPDATE' then
    new.shopify_first_observed_at := coalesce(old.shopify_first_observed_at, now());
  else
    new.shopify_first_observed_at := now();
  end if;
  perform public.shopify_retention_lock(v_domain, v_id);
  if coalesce(new.occurred_at, new.shopify_first_observed_at) <= now() - interval '90 days'
     or exists (select 1 from public.shopify_order_redactions r where r.shop_domain = v_domain
       and r.order_id_hash = encode(sha256(convert_to(v_id, 'UTF8')), 'hex')) then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists chariow_shopify_retention_guard on public.chariow_sales;
create trigger chariow_shopify_retention_guard before insert or update on public.chariow_sales
for each row execute function public.guard_shopify_sale_retention();

create or replace function public.redact_shopify_orders(p_shop_domain text, p_order_ids text[]) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id text; v_count integer := 0; v_deleted integer; v_ids text[];
begin
  if p_shop_domain is null or length(p_shop_domain) > 253 or p_shop_domain !~ '^([a-z0-9-]+\.)*myshopify\.com$' then raise exception 'Invalid Shopify domain'; end if;
  if p_order_ids is null or cardinality(p_order_ids) > 10000 then raise exception 'Invalid Shopify order ID array'; end if;
  if exists (select 1 from unnest(p_order_ids) x where x is null or length(x) > 30 or x !~ '^[1-9][0-9]*$') then raise exception 'Invalid canonical Shopify order id'; end if;
  select coalesce(array_agg(id order by id::numeric), '{}') into v_ids from (select distinct unnest(p_order_ids) as id) ids;
  foreach v_id in array v_ids loop
    perform public.shopify_retention_lock(p_shop_domain, v_id);
    insert into public.shopify_order_redactions(shop_domain, order_id_hash)
      values (p_shop_domain, encode(sha256(convert_to(v_id, 'UTF8')), 'hex')) on conflict do nothing;
    delete from public.chariow_sales cs using public.stores s
      where cs.store_id = s.id and s.platform = 'shopify' and s.shop_domain = p_shop_domain
        and cs.chariow_sale_id = 'shopify:' || s.id::text || ':' || v_id;
    get diagnostics v_deleted = row_count;
    v_count := v_count + v_deleted;
  end loop;
  return v_count;
end $$;

create or replace function public.purge_shopify_sales_retention() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  delete from public.chariow_sales cs using public.stores s
    where cs.store_id = s.id and s.platform = 'shopify'
      and cs.chariow_sale_id like 'shopify:' || s.id::text || ':%'
      -- If both dates are absent, SQL NULL comparison conserves the row.
      and coalesce(cs.occurred_at, cs.shopify_first_observed_at) <= now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_shopify_sales_retention() from public, anon, authenticated;
grant execute on function public.purge_shopify_sales_retention() to service_role;
revoke all on function public.redact_shopify_orders(text, text[]) from public, anon, authenticated;
grant execute on function public.redact_shopify_orders(text, text[]) to service_role;
