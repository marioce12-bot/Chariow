alter table public.payment_recovery_cases add column if not exists source_sale_id text;
alter table public.payment_recovery_cases drop constraint if exists payment_recovery_cases_status_check;
alter table public.payment_recovery_cases add constraint payment_recovery_cases_status_check check(status in ('open','prepared','sent','recovered','opted_out'));
create unique index if not exists payment_recovery_source_sale_unique on public.payment_recovery_cases(store_id,source_sale_id) where source_sale_id is not null;
create unique index if not exists payment_recovery_recovered_sale_unique on public.payment_recovery_cases(store_id,sale_id) where sale_id is not null;
create index if not exists payment_recovery_source_sale_idx on public.payment_recovery_cases(store_id,source_sale_id);
grant select,insert,update,delete on public.payment_recovery_cases to authenticated,service_role;

alter table public.payment_recovery_cases add column if not exists recovered_amount numeric;
alter table public.payment_recovery_cases add column if not exists recovered_currency text;
alter table public.payment_recovery_cases add column if not exists opt_out_at timestamptz;
