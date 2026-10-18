-- Unknown amounts must not masquerade as observed zero revenue.
alter table public.chariow_sales alter column amount drop not null;
alter table public.chariow_sales alter column amount drop default;
alter table public.chariow_sales alter column net_amount drop not null;
alter table public.chariow_sales alter column net_amount drop default;

-- Repair only legacy synthesized zeros for which the saved payload proves no
-- amount was supplied. Preserve observed zeros and rows without provenance.
update public.chariow_sales
set net_amount = null
where net_amount = 0 and raw_payload <> '{}'::jsonb
  and coalesce(raw_payload #> '{settlement,amount}', raw_payload -> 'net_amount', raw_payload #> '{data,settlement,amount}', raw_payload #> '{data,net_amount}', raw_payload #> '{payload,settlement,amount}', raw_payload #> '{payload,net_amount}', raw_payload #> '{sale,settlement,amount}', raw_payload #> '{sale,net_amount}') is null;
update public.chariow_sales
set amount = null
where amount = 0 and raw_payload <> '{}'::jsonb
  and coalesce(raw_payload -> 'amount', raw_payload #> '{data,amount}', raw_payload #> '{payload,amount}', raw_payload #> '{sale,amount}') is null;

alter table public.stores add column if not exists sales_last_synced_at timestamptz;
alter table public.stores add column if not exists sales_last_sync_complete boolean;
alter table public.stores add column if not exists sales_sync_error text;
