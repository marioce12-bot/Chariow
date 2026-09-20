create or replace function public.admin_grant_credits(
  target_user_id uuid,
  amount integer,
  grant_id text,
  reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account public.credit_accounts;
  before_balance integer;
begin
  if amount <= 0 or amount > 100000 then
    raise exception 'invalid_grant_amount';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'user_not_found';
  end if;
  insert into public.credit_accounts (user_id) values (target_user_id) on conflict (user_id) do nothing;
  select * into account from public.credit_accounts where user_id = target_user_id for update;
  if exists (select 1 from public.credit_transactions where external_id = grant_id) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'balance', account.balance);
  end if;
  before_balance := account.balance;
  update public.credit_accounts set balance = balance + amount where user_id = target_user_id;
  insert into public.credit_transactions (user_id, kind, credits, balance_before, balance_after, operation, external_id, status, metadata)
  values (target_user_id, 'purchase', amount, before_balance, before_balance + amount, 'admin_grant', grant_id, 'completed', jsonb_build_object('provider', 'admin_grant', 'amount_xof', 0, 'reason', reason));
  return jsonb_build_object('ok', true, 'balance', before_balance + amount);
end;
$$;

revoke all on function public.admin_grant_credits(uuid, integer, text, text) from public, anon, authenticated;

create or replace function public.admin_business_metrics()
returns jsonb language sql security definer set search_path = public as $$
select jsonb_build_object(
  'total_revenue_xof', coalesce((select sum((metadata->>'amount_xof')::numeric) from public.credit_transactions where kind = 'purchase' and status = 'completed' and coalesce(metadata->>'provider', '') <> 'admin_grant'), 0) + coalesce((select sum((metadata->>'amount_xof')::numeric) from public.payment_events where status = 'approved' and plan is not null), 0),
  'credit_revenue_xof', coalesce((select sum((metadata->>'amount_xof')::numeric) from public.credit_transactions where kind = 'purchase' and status = 'completed' and coalesce(metadata->>'provider', '') <> 'admin_grant'), 0),
  'subscription_revenue_xof', coalesce((select sum((metadata->>'amount_xof')::numeric) from public.payment_events where status = 'approved' and plan is not null), 0),
  'credit_purchases', (select count(*) from public.credit_transactions where kind = 'purchase' and status = 'completed' and coalesce(metadata->>'provider', '') <> 'admin_grant'),
  'credits_sold', coalesce((select sum(credits) from public.credit_transactions where kind = 'purchase' and status = 'completed' and coalesce(metadata->>'provider', '') <> 'admin_grant'), 0),
  'active_subscriptions', (select count(*) from public.subscriptions where status = 'active'),
  'registered_users', (select count(*) from public.profiles),
  'studio_generations', (select count(*) from public.credit_transactions where kind = 'debit')
);
$$;

revoke all on function public.admin_business_metrics() from public, anon, authenticated;
notify pgrst, 'reload schema';
