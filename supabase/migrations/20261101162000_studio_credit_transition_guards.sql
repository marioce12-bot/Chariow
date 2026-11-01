begin;

create or replace function public.complete_credit_debit(transaction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_row public.credit_transactions;
  new_balance integer;
begin
  select * into transaction_row
  from public.credit_transactions
  where id = transaction_id
  for update;

  if transaction_row.id is null then return false; end if;
  if transaction_row.status = 'completed' then return true; end if;
  -- A delayed provider callback must never turn a refunded debit back into a charge.
  if transaction_row.status <> 'pending' then return false; end if;

  update public.credit_accounts
  set balance = balance - transaction_row.credits,
      reserved = reserved - transaction_row.credits
  where user_id = transaction_row.user_id
    and balance >= transaction_row.credits
    and reserved >= transaction_row.credits
  returning balance into new_balance;
  if not found then return false; end if;

  update public.credit_transactions
  set balance_after = new_balance,
      status = 'completed'
  where id = transaction_id;
  return true;
end;
$$;

create or replace function public.refund_credit_debit(transaction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_row public.credit_transactions;
begin
  select * into transaction_row
  from public.credit_transactions
  where id = transaction_id
  for update;

  if transaction_row.id is null then return false; end if;
  -- Retries after a committed refund are successful and cannot add balance twice.
  if transaction_row.status = 'refunded' then return true; end if;

  if transaction_row.status = 'pending' then
    update public.credit_accounts
    set reserved = reserved - transaction_row.credits
    where user_id = transaction_row.user_id
      and reserved >= transaction_row.credits;
  elsif transaction_row.status = 'completed' then
    update public.credit_accounts
    set balance = balance + transaction_row.credits
    where user_id = transaction_row.user_id;
  else
    return false;
  end if;
  if not found then return false; end if;

  update public.credit_transactions
  set status = 'refunded'
  where id = transaction_id;
  return true;
end;
$$;

revoke all on function public.complete_credit_debit(uuid) from public, anon, authenticated;
revoke all on function public.refund_credit_debit(uuid) from public, anon, authenticated;
grant execute on function public.complete_credit_debit(uuid) to service_role;
grant execute on function public.refund_credit_debit(uuid) to service_role;

commit;
