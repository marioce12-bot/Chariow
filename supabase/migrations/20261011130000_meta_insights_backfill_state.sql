alter table public.meta_ad_accounts
  add column if not exists last_backfill_at timestamptz,
  add column if not exists backfill_status text,
  add column if not exists backfill_next_from date,
  add column if not exists backfill_started_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meta_ad_accounts_backfill_status_check'
      and conrelid = 'public.meta_ad_accounts'::regclass
  ) then
    alter table public.meta_ad_accounts
      add constraint meta_ad_accounts_backfill_status_check
      check (backfill_status is null or backfill_status in ('processing', 'in_progress', 'failed', 'complete'));
  end if;
end $$;
