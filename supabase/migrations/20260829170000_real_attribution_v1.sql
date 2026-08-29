-- Real attribution V1: anonymous touches, Checkout metadata and idempotent Pulses.
alter table public.attribution_touches alter column user_id drop not null;
alter table public.attribution_touches add column if not exists product_id text;
alter table public.attribution_touches add column if not exists product_slug text;
alter table public.attribution_touches add column if not exists expires_at timestamptz not null default (now() + interval '90 days');
alter table public.stores add column if not exists chariow_api_key_encrypted text;

alter table public.attribution_touches drop constraint if exists attribution_touches_user_id_visitor_id_key;
create unique index if not exists attribution_touches_store_visitor_unique_idx on public.attribution_touches(store_id, visitor_id) where store_id is not null;
create index if not exists attribution_touches_store_visitor_captured_idx on public.attribution_touches(store_id, visitor_id, captured_at desc);

alter table public.chariow_pulse_events add column if not exists pulse_delivery_id text;
alter table public.chariow_pulse_events add column if not exists store_id uuid references public.stores(id) on delete set null;
create unique index if not exists chariow_pulse_events_delivery_unique_idx on public.chariow_pulse_events(pulse_delivery_id) where pulse_delivery_id is not null;
create index if not exists chariow_pulse_events_delivery_idx on public.chariow_pulse_events(pulse_delivery_id);

alter table public.meta_attributions add column if not exists visitor_id text;
alter table public.meta_attributions add column if not exists meta_campaign_id text;
alter table public.meta_attributions add column if not exists meta_adset_id text;
alter table public.meta_attributions add column if not exists meta_ad_id text;
alter table public.meta_attributions add column if not exists attributed_gross_revenue numeric(14,2) not null default 0;
alter table public.meta_attributions add column if not exists attributed_net_revenue numeric(14,2) not null default 0;
alter table public.meta_attributions add column if not exists sale_status text;
alter table public.meta_attributions add column if not exists settlement_done boolean not null default false;
alter table public.meta_attributions add column if not exists updated_at timestamptz not null default now();

with duplicates as (
  select id, row_number() over (partition by chariow_sale_id order by attributed_at desc, id desc) as row_number
  from public.meta_attributions
  where chariow_sale_id is not null
)
delete from public.meta_attributions target using duplicates
where target.id = duplicates.id and duplicates.row_number > 1;

create unique index if not exists meta_attributions_chariow_sale_unique_idx on public.meta_attributions(chariow_sale_id) where chariow_sale_id is not null;
create index if not exists meta_attributions_campaign_attributed_idx on public.meta_attributions(meta_campaign_id, attributed_at desc);
create index if not exists meta_attributions_store_attributed_idx on public.meta_attributions(store_id, attributed_at desc);
