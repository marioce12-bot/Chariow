-- À exécuter après `supabase db reset` sur une base locale Supabase.
-- Vérifie les retries et l'ordre concurrent callback/remboursement; tout est annulé.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('66666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', 'credit-guard@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

insert into public.credit_accounts(user_id, balance, reserved)
values ('66666666-6666-4666-8666-666666666666', 500, 100)
on conflict (user_id) do update set balance = excluded.balance, reserved = excluded.reserved;

insert into public.credit_transactions(id, user_id, kind, credits, balance_before, balance_after, operation, external_id, status)
values
  ('aaaaaaaa-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666666', 'debit', 100, 500, 500, 'studio_test', 'credit-guard-complete', 'pending'),
  ('bbbbbbbb-2222-4222-8222-222222222222', '66666666-6666-4666-8666-666666666666', 'debit', 50, 500, 500, 'studio_test', 'credit-guard-pending-refund', 'pending');

-- The second debit's reservation is included in the account before testing.
update public.credit_accounts set reserved = 150 where user_id = '66666666-6666-4666-8666-666666666666';

do $$
declare
  v boolean;
  v_balance integer;
  v_reserved integer;
begin
  v := public.complete_credit_debit('aaaaaaaa-1111-4111-8111-111111111111');
  if v is distinct from true then raise exception 'pending debit did not complete'; end if;
  select balance, reserved into v_balance, v_reserved from public.credit_accounts where user_id = '66666666-6666-4666-8666-666666666666';
  if v_balance <> 400 or v_reserved <> 50 then raise exception 'completed debit produced wrong account totals: %, %', v_balance, v_reserved; end if;

  v := public.complete_credit_debit('aaaaaaaa-1111-4111-8111-111111111111');
  if v is distinct from true then raise exception 'duplicate completion was not idempotent'; end if;
  v := public.refund_credit_debit('aaaaaaaa-1111-4111-8111-111111111111');
  if v is distinct from true then raise exception 'completed debit did not refund'; end if;
  v := public.refund_credit_debit('aaaaaaaa-1111-4111-8111-111111111111');
  if v is distinct from true then raise exception 'duplicate refund was not idempotent'; end if;
  v := public.complete_credit_debit('aaaaaaaa-1111-4111-8111-111111111111');
  if v is distinct from false then raise exception 'a refunded debit was completed again'; end if;
  select balance, reserved into v_balance, v_reserved from public.credit_accounts where user_id = '66666666-6666-4666-8666-666666666666';
  if v_balance <> 500 or v_reserved <> 50 then raise exception 'refunded debit changed account totals twice: %, %', v_balance, v_reserved; end if;

  v := public.refund_credit_debit('bbbbbbbb-2222-4222-8222-222222222222');
  if v is distinct from true then raise exception 'pending debit did not release its reservation'; end if;
  v := public.complete_credit_debit('bbbbbbbb-2222-4222-8222-222222222222');
  if v is distinct from false then raise exception 'a refunded pending debit was completed'; end if;
  select balance, reserved into v_balance, v_reserved from public.credit_accounts where user_id = '66666666-6666-4666-8666-666666666666';
  if v_balance <> 500 or v_reserved <> 0 then raise exception 'pending refund changed account totals incorrectly: %, %', v_balance, v_reserved; end if;
end;
$$;

rollback;
