-- Stable public identifiers for seller landing pages.
alter table public.stores add column if not exists slug text;

update public.stores
set slug = coalesce(nullif(lower(regexp_replace(trim(store_name), '[^a-zA-Z0-9]+', '-', 'g')), ''), 'store') || '-' || substr(id::text, 1, 8)
where slug is null or slug = '';

alter table public.stores alter column slug set not null;
create unique index if not exists stores_slug_unique_idx on public.stores(slug);

-- Keep the existing legacy sale_id data usable before enforcing the new idempotency key.
update public.meta_attributions
set chariow_sale_id = sale_id
where chariow_sale_id is null and sale_id is not null;

with duplicates as (
  select id, row_number() over (partition by chariow_sale_id order by attributed_at desc, id desc) as row_number
  from public.meta_attributions
  where chariow_sale_id is not null
)
delete from public.meta_attributions target using duplicates
where target.id = duplicates.id and duplicates.row_number > 1;

create unique index if not exists meta_attributions_chariow_sale_unique_idx
  on public.meta_attributions(chariow_sale_id)
  where chariow_sale_id is not null;

-- The service-role backend is the only writer for visitor touches and Pulse events.
drop policy if exists "Users can read their attribution touches" on public.attribution_touches;
create policy "Users can read their attribution touches"
  on public.attribution_touches for select using (auth.uid() = user_id);
