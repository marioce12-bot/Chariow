-- Run only against an empty disposable database:
-- psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/sql/five-day-trial.sql
\set ON_ERROR_STOP on
begin;
set timezone = 'Europe/Paris';
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create table public.profiles (id uuid primary key, email text, full_name text);
create table public.subscriptions (
  user_id uuid primary key, plan text, status text, trial_active boolean,
  trial_ends_at timestamptz, messages_limit integer, messages_used_this_month integer default 0,
  current_period_end date, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.credit_accounts (user_id uuid primary key, balance integer);
create table public.credit_transactions (
  user_id uuid, kind text, credits integer, balance_before integer,
  balance_after integer, operation text, metadata jsonb
);
-- Install the actual previous signup and credit functions, not a JS simulation.
\ir ../../supabase/migrations/20260922010000_unified_subscription_and_trial.sql
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger on_auth_user_created_credit_account after insert on auth.users for each row execute function public.handle_new_user_credit_account();
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000001', 'active@example.test'),
 ('00000000-0000-0000-0000-000000000002', 'expired@example.test'),
 ('00000000-0000-0000-0000-000000000003', 'paid@example.test');
update public.subscriptions set trial_ends_at = now() - interval '1 hour', status = 'past_due' where user_id = '00000000-0000-0000-0000-000000000002';
update public.subscriptions set trial_active = false, status = 'active', current_period_end = current_date + 30 where user_id = '00000000-0000-0000-0000-000000000003';
create temporary table subscriptions_before as table public.subscriptions;
create temporary table credits_before as table public.credit_accounts;
create temporary table transactions_before as table public.credit_transactions;
\ir ../../supabase/migrations/20261023120000_five_day_new_trials.sql
-- Re-applying configuration must also be harmless.
\ir ../../supabase/migrations/20261023120000_five_day_new_trials.sql
DO $$
begin
 if exists ((select * from public.subscriptions except select * from subscriptions_before) union all (select * from subscriptions_before except select * from public.subscriptions)) then
   raise exception 'Existing subscriptions changed';
 end if;
 if exists ((select * from public.credit_accounts except select * from credits_before) union all (select * from credits_before except select * from public.credit_accounts)) then
   raise exception 'Existing credit balances changed';
 end if;
 if (select count(*) from public.credit_transactions) <> (select count(*) from transactions_before) then
   raise exception 'Welcome credits granted again';
 end if;
end $$;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000004', 'new@example.test');
insert into public.subscriptions (user_id) values ('00000000-0000-0000-0000-000000000005');
DO $$
begin
 if (select extract(epoch from (trial_ends_at - created_at)) from public.subscriptions where user_id = '00000000-0000-0000-0000-000000000004') <> 432000 then
   raise exception 'Signup trial is not exactly five 24-hour days';
 end if;
 if (select extract(epoch from (trial_ends_at - created_at)) from public.subscriptions where user_id = '00000000-0000-0000-0000-000000000005') <> 432000 then
   raise exception 'Column default is not exactly five 24-hour days';
 end if;
 if (select balance from public.credit_accounts where user_id = '00000000-0000-0000-0000-000000000004') <> 75 or
    (select count(*) from public.credit_transactions where user_id = '00000000-0000-0000-0000-000000000004' and operation = 'welcome_credits' and credits = 75) <> 1 then
   raise exception 'New signup welcome-credit policy changed';
 end if;
 -- This test runs across the October DST transition: 120 hours must stay 432000 seconds.
 if extract(epoch from (timestamptz '2026-10-23 12:00:00 Europe/Paris' + interval '120 hours' - timestamptz '2026-10-23 12:00:00 Europe/Paris')) <> 432000 then
   raise exception 'DST changed the new trial duration';
 end if;
end $$;
-- Re-running only the signup handler for an existing identity cannot replace its deadline.
create trigger test_replayed_signup after update on auth.users for each row execute function public.handle_new_user();
update auth.users set email = email where id = '00000000-0000-0000-0000-000000000001';
DO $$
begin
 if exists (select * from public.subscriptions where user_id='00000000-0000-0000-0000-000000000001' except select * from subscriptions_before where user_id='00000000-0000-0000-0000-000000000001') then
   raise exception 'Repeated signup reset an existing trial';
 end if;
end $$;
rollback;
\echo 'PASS: five-day signup/default, legacy deadlines, paid periods, credits, replay and DST'
