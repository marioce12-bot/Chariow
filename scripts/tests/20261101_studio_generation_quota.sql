-- À exécuter après `supabase db reset` avec psql sur une base locale Supabase.
-- Tout est annulé à la fin; aucun fixture ne persiste.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'quota-owner-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'quota-owner-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

update public.studio_generation_user_limits set daily_video_limit = 2, daily_image_limit = 50
where user_id in ('44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555');
insert into public.studio_generation_user_limits(user_id, daily_video_limit, daily_image_limit)
values ('44444444-4444-4444-8444-444444444444', 2, 50), ('55555555-5555-4555-8555-555555555555', 2, 50)
on conflict (user_id) do update set daily_video_limit = excluded.daily_video_limit, daily_image_limit = excluded.daily_image_limit;

do $$
declare
  v jsonb;
  i integer;
begin
  v := public.reserve_video_slot('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  if v->>'ok' <> 'true' or v->>'used' <> '1' then raise exception 'first video reservation failed: %', v; end if;
  v := public.reserve_video_slot('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
  if v->>'ok' <> 'false' or v->>'reason' <> 'VIDEO_GENERATION_ACTIVE' then raise exception 'second active video was not rejected: %', v; end if;
  v := public.release_video_slot('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  if v->>'released' <> 'true' then raise exception 'failed video did not release its slot: %', v; end if;
  v := public.reserve_video_slot('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
  if v->>'ok' <> 'true' then raise exception 'video slot was not returned after failure: %', v; end if;
  v := public.complete_video_slot('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
  if v->>'completed' <> 'true' then raise exception 'video slot was not consumed on success: %', v; end if;
  v := public.reserve_video_slot('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3');
  if v->>'ok' <> 'true' then raise exception 'second daily video was unexpectedly rejected: %', v; end if;
  perform public.complete_video_slot('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3');
  v := public.reserve_video_slot('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4');
  if v->>'ok' <> 'false' or v->>'reason' <> 'DAILY_VIDEO_LIMIT' then raise exception 'third daily video was not rejected: %', v; end if;
  v := public.reserve_video_slot('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3');
  if v->>'ok' <> 'true' or v->>'duplicate' <> 'true' then raise exception 'repeated idempotency key was not idempotent: %', v; end if;

  for i in 1..50 loop
    v := public.reserve_image_slot('44444444-4444-4444-8444-444444444444', md5('quota-image-' || i)::uuid);
    if v->>'ok' <> 'true' then raise exception 'image % was rejected before limit 50: %', i, v; end if;
    perform public.complete_image_slot('44444444-4444-4444-8444-444444444444', md5('quota-image-' || i)::uuid);
  end loop;
  v := public.reserve_image_slot('44444444-4444-4444-8444-444444444444', md5('quota-image-51')::uuid);
  if v->>'ok' <> 'false' or v->>'reason' <> 'DAILY_IMAGE_LIMIT' then raise exception '51st image was not rejected: %', v; end if;
  v := public.reserve_video_slot('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1');
  if v->>'ok' <> 'true' then raise exception 'a different user was affected by owner A quota: %', v; end if;
  perform public.complete_video_slot('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1');
  update public.studio_generation_user_limits set daily_video_limit = 1, daily_image_limit = 1
    where user_id = '55555555-5555-4555-8555-555555555555';
  v := public.reserve_video_slot('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2');
  if v->>'ok' <> 'false' or v->>'reason' <> 'DAILY_VIDEO_LIMIT' then raise exception 'per-user video limit was not respected: %', v; end if;
  v := public.reserve_image_slot('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3');
  if v->>'ok' <> 'true' then raise exception 'per-user image quota rejected its first reservation: %', v; end if;
  perform public.complete_image_slot('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3');
  v := public.reserve_image_slot('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4');
  if v->>'ok' <> 'false' or v->>'reason' <> 'DAILY_IMAGE_LIMIT' then raise exception 'per-user image limit was not respected: %', v; end if;
  v := public.get_studio_generation_quota('44444444-4444-4444-8444-444444444444', 'video');
  if v->>'used' <> '2' or v->>'daily_limit' <> '2' or not (v ? 'reset_at') then raise exception 'quota API fields/reset were incorrect: %', v; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.studio_generation_quota_reservations where user_id <> auth.uid()) then
    raise exception 'owner A can read another user quota reservation';
  end if;
  if (select count(*) from public.studio_generation_quota_reservations where user_id = auth.uid()) < 50 then
    raise exception 'owner A cannot read its own quota rows';
  end if;
  if has_table_privilege(current_user, 'public.studio_generation_quota_reservations', 'INSERT') then
    raise exception 'authenticated can write quota reservations';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.studio_generation_quota_reservations where user_id <> auth.uid()) then
    raise exception 'owner B can read another user quota reservation';
  end if;
  if (select count(*) from public.studio_generation_quota_reservations where user_id = auth.uid()) <> 2 then
    raise exception 'owner B should see only its own quota reservation';
  end if;
end;
$$;
reset role;
rollback;
