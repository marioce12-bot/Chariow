-- À exécuter après `supabase db reset` sur une base Supabase locale.
-- Les fixtures sont annulées; aucune base distante ne doit être utilisée.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('77777777-7777-4777-8777-777777777777', 'authenticated', 'authenticated', 'fal-callback@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

update public.credit_accounts
set balance = 100, reserved = 15
where user_id = '77777777-7777-4777-8777-777777777777';
insert into public.credit_transactions (id, user_id, kind, credits, balance_before, balance_after, operation, external_id, status)
values
  ('72000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', 'debit', 5, 100, 100, 'video_generation', 'fal-callback-credit-success', 'pending'),
  ('72000000-0000-4000-8000-000000000003', '77777777-7777-4777-8777-777777777777', 'debit', 5, 100, 100, 'video_generation', 'fal-callback-credit-timeout', 'pending'),
  ('72000000-0000-4000-8000-000000000004', '77777777-7777-4777-8777-777777777777', 'debit', 5, 100, 100, 'video_generation', 'fal-callback-credit-rollback', 'pending');

insert into public.studio_generations(id, user_id, kind, prompt, options, status, provider_request_id)
values
  ('70000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', 'video', 'callback lease success test', '{}'::jsonb, 'processing', 'fal-lease-ok-test'),
  ('70000000-0000-4000-8000-000000000002', '77777777-7777-4777-8777-777777777777', 'video', 'callback lease error test', '{}'::jsonb, 'processing', 'fal-lease-error-test'),
  ('70000000-0000-4000-8000-000000000003', '77777777-7777-4777-8777-777777777777', 'video', 'callback timeout test', '{}'::jsonb, 'processing', 'fal-lease-timeout-test'),
  ('70000000-0000-4000-8000-000000000004', '77777777-7777-4777-8777-777777777777', 'video', 'quota rollback test', '{}'::jsonb, 'processing', 'fal-lease-rollback-test');
update public.studio_generations
set credit_transaction_id = case id
  when '70000000-0000-4000-8000-000000000001' then '72000000-0000-4000-8000-000000000001'::uuid
  when '70000000-0000-4000-8000-000000000003' then '72000000-0000-4000-8000-000000000003'::uuid
  when '70000000-0000-4000-8000-000000000004' then '72000000-0000-4000-8000-000000000004'::uuid
end
where id in (
  '70000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000004'
);
update public.studio_generations set created_at = now() - interval '15 minutes'
where id = '70000000-0000-4000-8000-000000000003';

do $$
declare
  v jsonb;
  v_ok boolean;
  v_status text;
  v_transaction_status text;
  v_balance integer;
  v_reserved integer;
begin
  v := public.reserve_video_slot('77777777-7777-4777-8777-777777777777', '70000000-0000-4000-8000-000000000001');
  if v->>'ok' <> 'true' then raise exception 'success fixture could not reserve quota: %', v; end if;

  v := public.claim_studio_video_callback('fal-lease-ok-test', '77777777-7777-4777-8777-777777777777', 'OK', '71000000-0000-4000-8000-000000000001');
  if v->>'outcome' <> 'claimed' then raise exception 'first OK callback was not claimed: %', v; end if;
  v := public.claim_studio_video_callback('fal-lease-ok-test', '77777777-7777-4777-8777-777777777777', 'OK', '71000000-0000-4000-8000-000000000002');
  if v->>'outcome' <> 'busy' then raise exception 'duplicate concurrent OK callback was not held: %', v; end if;
  v := public.claim_studio_video_callback('fal-lease-ok-test', '77777777-7777-4777-8777-777777777777', 'ERROR', '71000000-0000-4000-8000-000000000003');
  if v->>'outcome' <> 'conflict' then raise exception 'conflicting callback status was not rejected: %', v; end if;
  v_ok := public.record_studio_video_callback_asset('70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', 'cloudinary-private:wrong-token');
  if v_ok then raise exception 'asset from a non-owner lease token was accepted'; end if;
  v_ok := public.record_studio_video_callback_asset('70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'cloudinary-private:success-asset');
  if not v_ok then raise exception 'current lease could not persist its imported asset'; end if;
  v_ok := public.record_studio_video_callback_asset('70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'cloudinary-private:other-asset');
  if v_ok then raise exception 'retry overwrote an already persisted asset path'; end if;

  v_ok := public.complete_studio_video_callback('70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'cloudinary-private:success-asset');
  if not v_ok then raise exception 'valid leased callback did not atomically complete'; end if;
  select status into v_status from public.studio_generations where id = '70000000-0000-4000-8000-000000000001';
  select status into v_transaction_status from public.credit_transactions where id = '72000000-0000-4000-8000-000000000001';
  if v_status <> 'completed' or v_transaction_status <> 'completed' then raise exception 'generation and credit did not complete together'; end if;
  select status into v_status from public.studio_generation_quota_reservations where user_id = '77777777-7777-4777-8777-777777777777' and request_id = '70000000-0000-4000-8000-000000000001';
  if v_status <> 'consumed' then raise exception 'successful generation did not consume its reserved quota'; end if;
  v_ok := public.complete_studio_video_callback('70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'cloudinary-private:success-asset');
  if v_ok then raise exception 'terminal generation was finalized more than once'; end if;
  v := public.claim_studio_video_callback('fal-lease-ok-test', '77777777-7777-4777-8777-777777777777', 'OK', '71000000-0000-4000-8000-000000000004');
  if v->>'outcome' <> 'terminal' then raise exception 'completed duplicate callback was not terminal: %', v; end if;

  v := public.claim_studio_video_callback('fal-lease-error-test', '77777777-7777-4777-8777-777777777777', 'ERROR', '71000000-0000-4000-8000-000000000005');
  if v->>'outcome' <> 'claimed' then raise exception 'ERROR callback was not claimed: %', v; end if;
  v_ok := public.finish_studio_video_callback('70000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000005', 'failed', null, 'provider error');
  if not v_ok then raise exception 'valid ERROR callback did not finish as failed'; end if;

  v := public.reserve_video_slot('77777777-7777-4777-8777-777777777777', '70000000-0000-4000-8000-000000000003');
  if v->>'ok' <> 'true' then raise exception 'timeout fixture could not reserve quota: %', v; end if;
  v := public.claim_studio_video_callback('fal-lease-timeout-test', '77777777-7777-4777-8777-777777777777', 'OK', '71000000-0000-4000-8000-000000000006');
  if v->>'outcome' <> 'claimed' then raise exception 'timeout fixture callback was not claimed: %', v; end if;
  v_ok := public.fail_stale_studio_video_generation('70000000-0000-4000-8000-000000000003', now() - interval '12 minutes', 'timeout');
  if v_ok then raise exception 'timeout invalidated a callback with an active lease'; end if;
  update public.studio_generations set provider_callback_lease_until = now() - interval '1 second'
    where id = '70000000-0000-4000-8000-000000000003';
  v_ok := public.record_studio_video_callback_asset('70000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000006', 'cloudinary-private:late-timeout-asset');
  if v_ok then raise exception 'expired callback persisted an imported asset'; end if;
  if (select storage_path from public.studio_generations where id = '70000000-0000-4000-8000-000000000003') is not null then
    raise exception 'expired callback left an imported asset path behind';
  end if;
  v_ok := public.complete_studio_video_callback('70000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000006', 'cloudinary-private:timeout-race-asset');
  if v_ok then raise exception 'expired callback completed and charged its generation'; end if;
  select status into v_transaction_status from public.credit_transactions where id = '72000000-0000-4000-8000-000000000003';
  select balance, reserved into v_balance, v_reserved from public.credit_accounts where user_id = '77777777-7777-4777-8777-777777777777';
  if v_transaction_status <> 'pending' or v_balance <> 95 or v_reserved <> 10 then raise exception 'expired callback changed credit state before timeout compensation'; end if;
  v_ok := public.fail_stale_studio_video_generation('70000000-0000-4000-8000-000000000003', now() - interval '12 minutes', 'timeout');
  if not v_ok then raise exception 'expired callback lease did not permit timeout compensation'; end if;
  if not public.refund_credit_debit('72000000-0000-4000-8000-000000000003') then raise exception 'timeout did not refund the reserved debit'; end if;
  v := public.release_video_slot('77777777-7777-4777-8777-777777777777', '70000000-0000-4000-8000-000000000003');
  if v->>'released' <> 'true' then raise exception 'timeout did not release the reserved quota'; end if;
  v_ok := public.complete_studio_video_callback('70000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000006', 'cloudinary-private:timeout-race-asset');
  if v_ok then raise exception 'late callback reversed timeout compensation'; end if;
  select status into v_transaction_status from public.credit_transactions where id = '72000000-0000-4000-8000-000000000003';
  select status into v_status from public.studio_generation_quota_reservations where user_id = '77777777-7777-4777-8777-777777777777' and request_id = '70000000-0000-4000-8000-000000000003';
  if v_transaction_status <> 'refunded' or v_status <> 'released' then raise exception 'late callback changed refunded credit or released quota'; end if;

  v := public.claim_studio_video_callback('fal-lease-rollback-test', '77777777-7777-4777-8777-777777777777', 'OK', '71000000-0000-4000-8000-000000000007');
  if v->>'outcome' <> 'claimed' then raise exception 'quota rollback fixture callback was not claimed: %', v; end if;
  v_ok := public.record_studio_video_callback_asset('70000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000007', 'cloudinary-private:rollback-asset');
  if not v_ok then raise exception 'quota rollback fixture could not persist its asset'; end if;
  begin
    v_ok := public.complete_studio_video_callback('70000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000007', 'cloudinary-private:rollback-asset');
    raise exception 'missing quota did not abort atomic success';
  exception when others then
    if sqlerrm <> 'studio_video_quota_completion_failed' then raise; end if;
  end;
  select status into v_transaction_status from public.credit_transactions where id = '72000000-0000-4000-8000-000000000004';
  select balance, reserved into v_balance, v_reserved from public.credit_accounts where user_id = '77777777-7777-4777-8777-777777777777';
  if v_transaction_status <> 'pending' or v_balance <> 95 or v_reserved <> 5 then raise exception 'failed quota completion did not roll back the credit debit'; end if;
end;
$$;

rollback;
