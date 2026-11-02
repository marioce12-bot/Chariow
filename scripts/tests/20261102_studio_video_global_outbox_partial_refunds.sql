-- À exécuter après `supabase db reset` et toutes les migrations locales.
-- Fixtures annulées par ROLLBACK; aucun appel fournisseur n’est réalisé.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('66666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', 'video-global-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777777', 'authenticated', 'authenticated', 'video-global-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

update public.studio_video_global_limits set max_active_jobs = 1 where singleton = true;

do $$
declare v jsonb; v_tx uuid; v_before integer; v_after integer;
begin
  v := public.reserve_studio_video_quota('66666666-6666-4666-8666-666666666666', '88888888-8888-4888-8888-888888888881', '480p');
  if v->>'ok' <> 'true' then raise exception 'first global reservation failed: %', v; end if;
  v := public.reserve_studio_video_quota('77777777-7777-4777-8777-777777777777', '99999999-9999-4999-8999-999999999991', '480p');
  if v->>'ok' <> 'false' or v->>'code' <> 'GLOBAL_ACTIVE_LIMIT' then raise exception 'global concurrent limit was not enforced: %', v; end if;

  insert into public.studio_generations(id, user_id, kind, prompt, options, metadata, status, credits_cost, video_job_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '66666666-6666-4666-8666-666666666666', 'video', 'test', '{}'::jsonb, '{"phase":"queued"}'::jsonb, 'processing', 750, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  if not exists (select 1 from public.studio_video_reconcile_outbox where generation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') then
    raise exception 'video generation was not enqueued for reconciliation';
  end if;

  update public.credit_accounts set balance = 1000, reserved = 0 where user_id = '66666666-6666-4666-8666-666666666666';
  v := public.reserve_credits('66666666-6666-4666-8666-666666666666', 750, 'studio_video', 'test', 500, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  if v->>'ok' <> 'true' then raise exception 'test debit reservation failed: %', v; end if;
  v_tx := (v->>'transaction_id')::uuid;
  v := public.refund_studio_video_partial(v_tx, 300, format('studio-video-partial:%s:%s', v_tx, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'));
  if v->>'ok' <> 'true' or v->>'refunded_credits' <> '300' or v->>'consumed_credits' <> '450' then
    raise exception 'partial refund did not charge only generated share: %', v;
  end if;
  select balance into v_after from public.credit_accounts where user_id = '66666666-6666-4666-8666-666666666666';
  if v_after <> 550 then raise exception 'balance after 450-credit charge was incorrect: %', v_after; end if;
  v := public.refund_studio_video_partial(v_tx, 300, format('studio-video-partial:%s:%s', v_tx, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'));
  if v->>'duplicate' <> 'true' then raise exception 'partial refund retry was not idempotent: %', v; end if;
  select balance into v_before from public.credit_accounts where user_id = '66666666-6666-4666-8666-666666666666';
  if v_before <> v_after then raise exception 'idempotent retry changed the balance'; end if;
end;
$$;

rollback;
