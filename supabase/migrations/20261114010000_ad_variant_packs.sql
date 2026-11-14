create table if not exists public.ad_variant_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id text not null,
  store_id uuid references public.stores(id) on delete set null,
  product_id text not null,
  product_name text not null,
  destination_url text not null,
  meta_ad_account_id uuid references public.meta_ad_accounts(id) on delete set null,
  meta_page_id text not null,
  dsa_beneficiary text not null,
  dsa_payor text not null,
  countries jsonb not null default '[]'::jsonb,
  geo_targeting jsonb not null default '{}'::jsonb,
  meta_targeting jsonb not null default '{}'::jsonb,
  advantage_audience boolean not null default false,
  min_age integer not null default 18,
  max_age integer not null default 65,
  daily_budget numeric not null,
  duration_days integer not null,
  variants jsonb not null,
  status text not null default 'draft' check (status in ('draft','claimed','blocked','completed','partial','ambiguous')),
  objective text not null default 'sales' check (objective in ('sales','traffic')),
  claim_token uuid,
  checkpoints jsonb not null default '{}'::jsonb,
  external_campaign_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, client_request_id),
  check (daily_budget >= 3), check (duration_days between 1 and 90),
  check (min_age between 18 and 65), check (max_age between min_age and 65),
  check (jsonb_array_length(variants) = 3)
);
alter table public.ad_variant_packs enable row level security;
create policy "Users read own ad variant packs" on public.ad_variant_packs for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.ad_variant_packs from public, anon, authenticated;
grant select on public.ad_variant_packs to authenticated;
grant select, insert, update on public.ad_variant_packs to service_role;
create index if not exists ad_variant_packs_store_idx on public.ad_variant_packs(user_id, store_id, created_at desc);
create or replace function public.claim_ad_variant_pack(p_id uuid, p_user_id uuid, p_claim_token uuid)
returns boolean language sql security definer set search_path = public as $$
  with claimed as (
    update public.ad_variant_packs set status = 'claimed', claim_token = p_claim_token, updated_at = now()
    where id = p_id and user_id = p_user_id and status = 'draft' returning id
  ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_ad_variant_pack(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_ad_variant_pack(uuid, uuid, uuid) to service_role;
