-- Future signups only: never backfill or top up existing credit accounts.
-- The account insert serializes concurrent attempts; only its winner writes the ledger.
create or replace function public.handle_new_user_credit_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.credit_transactions
    where user_id = new.id and operation = 'welcome_credits'
  ) then
    return new;
  end if;

  insert into public.credit_accounts (user_id, balance)
  values (new.id, 100)
  on conflict (user_id) do nothing;

  if found then
    insert into public.credit_transactions (user_id, kind, credits, balance_before, balance_after, operation, metadata)
    values (new.id, 'purchase', 100, 0, 100, 'welcome_credits', jsonb_build_object('source', 'signup'));
  end if;
  return new;
end;
$$;

-- Keep one INSERT-only trigger, including databases where it was missing.
-- This never fires for existing users when the migration is installed.
create or replace trigger on_auth_user_created_credit_account
  after insert on auth.users
  for each row execute function public.handle_new_user_credit_account();
