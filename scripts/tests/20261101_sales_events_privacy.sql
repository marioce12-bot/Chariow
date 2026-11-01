-- Exécuter avec psql après `supabase db reset`, sur une base Supabase locale.
-- Supabase locale. Tout est annulé à la fin; aucun fixture ne persiste.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'rls-owner-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'rls-owner-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'rls-owner-c@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

insert into public.stores (id, user_id, platform, store_name, mcp_url)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'chariow', 'RLS A one', 'https://mcp.example.invalid'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111111', 'chariow', 'RLS A two', 'https://mcp.example.invalid'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '22222222-2222-4222-8222-222222222222', 'chariow', 'RLS B one', 'https://mcp.example.invalid');

insert into public.sales_events (event_id, store_id, user_id, status, amount, currency, product_id, product_name, created_at)
values
  ('rls-event-a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'paid', 10, 'XOF', 'p1', 'A product', now()),
  ('rls-event-a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111111', 'paid', 20, 'XOF', 'p2', 'A second product', now()),
  ('rls-event-b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '22222222-2222-4222-8222-222222222222', 'paid', 30, 'XOF', 'p3', 'B product', now());

-- Confirm the public tables contain only the explicitly approved columns.
do $$
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'sales_events') <> 9
     or exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'sales_events'
         and column_name not in ('event_id','store_id','user_id','status','amount','currency','product_id','product_name','created_at')
     ) then
    raise exception 'sales_events does not match the 9-column privacy allowlist';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'chariow_pulse_events') <> 9
     or exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'chariow_pulse_events'
         and column_name not in ('event_id','store_id','user_id','status','amount','currency','product_id','product_name','created_at')
     ) then
    raise exception 'chariow_pulse_events does not match the 9-column privacy allowlist';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales_events'
  ) then
    raise exception 'sales_events is missing from supabase_realtime publication';
  end if;
  if not exists (
    select 1 from cron.job where jobname = 'chariow-sales-retention-90d' and schedule = '17 3 * * *'
  ) then
    raise exception '90-day retention job is missing from Supabase Cron';
  end if;
end;
$$;

-- A user sees all and only their own stores' signals; a second user cannot read
-- events belonging to the first user, even when filtering by the first stores.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.sales_events) <> 2 then
    raise exception 'owner A should see exactly its two store events';
  end if;
  if (select count(*) from public.sales_events where store_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1') <> 0 then
    raise exception 'owner A must not see owner B events';
  end if;
  if has_table_privilege(current_user, 'public.sales_events', 'INSERT') then
    raise exception 'authenticated must not be allowed to insert Realtime signals directly';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.sales_events) <> 1 then
    raise exception 'owner B should see only its own event';
  end if;
  if (select count(*) from public.sales_events where store_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2')) <> 0 then
    raise exception 'owner B must see nothing from owner A stores';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.sales_events) <> 0 then
    raise exception 'an authenticated user without stores must see no events';
  end if;
end;
$$;
reset role;

-- The composite FK must reject an owner/store mismatch even for privileged writes.
do $$
begin
  begin
    insert into public.sales_events (event_id, store_id, user_id, status)
    values ('bad-owner-link', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-222222222222', 'paid');
    raise exception 'composite store-owner FK accepted a mismatched owner';
  exception when foreign_key_violation then
    null;
  end;
end;
$$;

insert into public.sales_events (event_id, store_id, user_id, status, created_at)
values ('retention-old-signal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'paid', now() - interval '91 days');
insert into public.chariow_pulse_events (event_id, store_id, user_id, status, created_at)
values
  ('retention-old-pulse', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'paid', now() - interval '91 days'),
  ('retention-new-pulse', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'paid', now());
insert into public.chariow_sales (chariow_sale_id, store_id, product_id, product_name, status, amount, net_amount, currency, settlement_done, occurred_at, raw_payload)
values ('retention-old-sale', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'p-old', 'Old product', 'paid', 100, 85, 'XOF', true, now() - interval '91 days', '{"customer":{"id":"private-customer","email":"person@example.invalid"},"api_key":"must-be-cleared"}'::jsonb);

do $$
begin
  perform public.purge_chariow_sales_retention();
  if exists (select 1 from public.sales_events where event_id = 'retention-old-signal') then
    raise exception 'sales_events older than 90 days were not purged';
  end if;
  if exists (select 1 from public.chariow_pulse_events where event_id = 'retention-old-pulse') then
    raise exception 'pulse event older than 90 days was not purged';
  end if;
  if not exists (select 1 from public.chariow_pulse_events where event_id = 'retention-new-pulse') then
    raise exception 'recent pulse event was purged unexpectedly';
  end if;
  if (select raw_payload from public.chariow_sales where chariow_sale_id = 'retention-old-sale') <> '{}'::jsonb then
    raise exception 'old Chariow sale payload was not cleared';
  end if;
  if (select customer_id from public.chariow_sales where chariow_sale_id = 'retention-old-sale') is not null then
    raise exception 'generated customer_id survived payload clearing';
  end if;
end;
$$;

rollback;
