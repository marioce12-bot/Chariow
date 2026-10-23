-- Disposable local database only. Run with tests/run-account-retention-sql.sh.
begin;
do $$
declare
 old_id uuid:=gen_random_uuid(); reused_id uuid:=gen_random_uuid(); pending_id uuid:=gen_random_uuid(); expired_id uuid:=gen_random_uuid();
 mail text:='  Preview.Mixed+Trial@invalid.test  '; key bytea:=decode(repeat('ab',32),'hex'); digest bytea;
 claims jsonb; deadline timestamptz; n integer; original_trial jsonb; original_message uuid;
begin
 update private.account_retention_config set hmac_key=key,configured_at=now() where singleton;
 -- Legacy account (created before migration) must get its marker during purge.
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(old_id,mail,now(),'{}');
 delete from private.retired_email_markers where email_hmac=private.email_retention_hmac(mail); -- simulate a pre-migration account
 insert into public.account_retention(user_id) values(old_id);
 update public.account_retention set deletion_requested_at=now()-interval '91 days', deletion_deadline=now()-interval '1 second' where user_id=old_id;
 insert into public.payment_events(user_id,payload) values(old_id,'{"pii":"sensitive payload"}');
 perform set_config('request.jwt.claim.role','service_role',true);
 n:=public.purge_expired_accounts(10);
 if n<>1 or exists(select 1 from auth.users where id=old_id) then raise exception 'legacy purge failed: n=%, users=%, deadline=%',n,(select count(*) from auth.users where id=old_id),(select deletion_deadline from public.account_retention where user_id=old_id); end if;
 if exists(select 1 from public.payment_events where user_id=old_id or payload::text like '%sensitive payload%') then raise exception 'payment payload survived purge'; end if;
 digest:=extensions.hmac(convert_to(lower(btrim(mail)),'UTF8'),key,'sha256');
 if not exists(select 1 from private.retired_email_markers where email_hmac=digest) then raise exception 'normalized email HMAC marker absent'; end if;
 if exists(select 1 from private.retired_email_markers where position(convert_to('Preview.Mixed','UTF8') in email_hmac)>0) then raise exception 'plaintext email retained'; end if;
 -- Re-signup with old email succeeds, but cannot obtain a fresh trial.
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(reused_id,'preview.mixed+trial@invalid.test',now(),'{"full_name":"Ordinary Name"}');
 if not exists(select 1 from public.profiles where id=reused_id and full_name='Ordinary Name') then raise exception 'normal profile metadata rejected'; end if;
 if not exists(select 1 from public.subscriptions where user_id=reused_id and trial_active=false and trial_ends_at<=now() and status='past_due') then raise exception 'reused email received trial or wrong state'; end if;
 -- New address gets regular trial, confirming idempotent marker decision.
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(pending_id,'fresh@invalid.test',now(),'{}');
 if not exists(select 1 from public.subscriptions where user_id=pending_id and trial_active=true and trial_ends_at>now()) then raise exception 'new account trial missing'; end if;
 perform set_config('request.jwt.claim.sub',pending_id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pending_id::text,'role','authenticated')::text,true);
 select to_jsonb(s) into original_trial from public.subscriptions s where user_id=pending_id;
 insert into public.messages(user_id,role,content) values(pending_id,'user','Fictional data preserved on restore') returning id into original_message;
 perform public.request_account_deletion();
 select deletion_deadline into deadline from public.account_retention where user_id=pending_id;
 if deadline <> now()+interval '90 days' then raise exception 'deletion request deadline invalid'; end if;
 perform public.request_account_deletion();
 if (select deletion_deadline from public.account_retention where user_id=pending_id) <> deadline then raise exception 'repeat request extended deadline'; end if;
 grant select on public.profiles,public.messages to authenticated;
 set local role authenticated;
 if exists(select 1 from public.profiles) or exists(select 1 from public.messages) then raise exception 'RLS leaked pending data'; end if;
 reset role;
 if public.retention_blocked_for_current_user() is not true then raise exception 'pending RLS helper did not block current user'; end if;
 -- Password / stale OTP are not enough to restore.
 claims:=jsonb_build_object('sub',pending_id::text,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','pwd','timestamp',extract(epoch from now()+interval '2 seconds')::bigint::text)));
 perform set_config('request.jwt.claims',claims::text,true);
 begin perform public.restore_account(); raise exception 'password restoration was accepted'; exception when insufficient_privilege then null; end;
 claims:=jsonb_build_object('sub',pending_id::text,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch from now()-interval '1 day')::bigint::text)));
 perform set_config('request.jwt.claims',claims::text,true);
 begin perform public.restore_account(); raise exception 'stale OTP restoration was accepted'; exception when insufficient_privilege then null; end;
 claims:=jsonb_build_object('sub',pending_id::text,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch from now()+interval '2 seconds')::bigint::text)));
 perform set_config('request.jwt.claims',claims::text,true);
 if (public.restore_account()->>'restored')::boolean is not true then raise exception 'fresh OTP restoration failed'; end if;
 if not exists(select 1 from auth.users where id=pending_id) or not exists(select 1 from public.messages where id=original_message and user_id=pending_id) then raise exception 'restore lost identity or data'; end if;
 if (select to_jsonb(s) from public.subscriptions s where user_id=pending_id) is distinct from original_trial then raise exception 'restore reset subscription or trial'; end if;
 set local role authenticated;
 if not exists(select 1 from public.messages where id=original_message) then raise exception 'restored data still blocked'; end if;
 reset role;
 -- Exact deadline is expired (not restorable).
 insert into auth.users(id,email,email_confirmed_at) values(expired_id,'deadline@invalid.test',now());
 insert into public.account_retention(user_id,deletion_requested_at,deletion_deadline) values(expired_id,now()-interval '90 days',now());
 perform set_config('request.jwt.claim.sub',expired_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',expired_id::text,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch from now()+interval '1 second')::bigint::text)))::text,true);
 begin perform public.restore_account(); raise exception 'deadline equality was accepted'; exception when sqlstate '55000' then null; end;
 -- Missing key fails closed; helper execution is narrow (does not expose UUID oracle).
 update private.account_retention_config set hmac_key=null where singleton;
 begin perform private.email_retention_hmac('x@invalid.test'); raise exception 'missing key accepted'; exception when sqlstate '55000' then null; end;
 if has_function_privilege('authenticated','private.retention_blocked(uuid)','execute') then raise exception 'UUID helper exposed'; end if;
 if not has_function_privilege('authenticated','public.retention_blocked_for_current_user()','execute') then raise exception 'RLS helper not executable'; end if;
 if has_function_privilege('anon','public.retention_blocked_for_current_user()','execute') then raise exception 'anonymous RLS helper execution'; end if;
 if has_function_privilege('anon','public.request_account_deletion()','execute') then raise exception 'anon can call RPC'; end if;
end $$;
rollback;
