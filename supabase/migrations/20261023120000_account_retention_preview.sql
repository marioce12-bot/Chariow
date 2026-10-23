-- Preview only: fail closed until an operator provisions a dedicated HMAC key in private.account_retention_config.
-- Never place the key in migrations, app settings exposed to clients, or user metadata.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.account_retention_config (
  singleton boolean primary key default true check (singleton),
  hmac_key bytea,
  configured_at timestamptz
);
revoke all on private.account_retention_config from public, anon, authenticated, service_role;
insert into private.account_retention_config(singleton) values (true) on conflict do nothing;

create table if not exists public.account_retention (
  user_id uuid primary key references auth.users(id) on delete cascade,
  deletion_requested_at timestamptz,
  deletion_deadline timestamptz,
  created_at timestamptz not null default now(),
  check ((deletion_requested_at is null) = (deletion_deadline is null))
);
create table if not exists private.retired_email_markers (
  email_hmac bytea primary key
);
revoke all on private.retired_email_markers from public, anon, authenticated, service_role;
alter table public.account_retention enable row level security;
revoke all on public.account_retention from public, anon, authenticated;
grant select on public.account_retention to authenticated;

create or replace function private.email_retention_hmac(p_email text)
returns bytea language plpgsql security definer set search_path = pg_catalog, private, extensions as $$
declare k bytea;
begin
  select hmac_key into k from private.account_retention_config where singleton;
  if k is null or octet_length(k) < 32 then raise exception 'ACCOUNT_RETENTION_HMAC_KEY_NOT_CONFIGURED' using errcode='55000'; end if;
  return extensions.hmac(convert_to(lower(btrim(p_email)), 'UTF8'), k, 'sha256');
end $$;
revoke all on function private.email_retention_hmac(text) from public, anon, authenticated, service_role;

-- A pending identity cannot change the email whose entitlement must be preserved.
create or replace function private.prevent_pending_email_change()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
 if lower(btrim(old.email)) is distinct from lower(btrim(new.email)) and exists(select 1 from public.account_retention where user_id=old.id and deletion_requested_at is not null) then
   raise exception 'PENDING_ACCOUNT_EMAIL_CHANGE_FORBIDDEN' using errcode='55000';
 end if;
 return new;
end $$;
revoke all on function private.prevent_pending_email_change() from public, anon, authenticated, service_role;
drop trigger if exists account_retention_email_guard on auth.users;
create trigger account_retention_email_guard before update of email on auth.users for each row execute function private.prevent_pending_email_change();

-- Replaces existing signup handler so marker is inserted atomically before subscription trial grant.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, private, pg_catalog as $$
declare inserted_count integer; trial_was_used boolean;
begin
  if new.email is null then raise exception 'ACCOUNT_RETENTION_EMAIL_REQUIRED'; end if;
  insert into private.retired_email_markers(email_hmac) values (private.email_retention_hmac(new.email)) on conflict do nothing;
  get diagnostics inserted_count = row_count;
  trial_was_used := inserted_count = 0;
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do update set email = excluded.email;
  insert into public.subscriptions (user_id, plan, status, trial_active, trial_ends_at, messages_limit)
  values (new.id, 'starter', case when trial_was_used then 'past_due'::public.subscription_status else 'trialing'::public.subscription_status end,
          not trial_was_used, case when trial_was_used then now() else now() + interval '15 days' end, 400)
  on conflict (user_id) do nothing;
  return new;
end $$;

create or replace function private.retention_blocked(p_user uuid)
returns boolean language sql stable security definer set search_path = public, auth, pg_catalog as $$
 select exists(select 1 from public.account_retention r where r.user_id=p_user and r.deletion_requested_at is not null)
$$;
revoke all on function private.retention_blocked(uuid) from public, anon, authenticated;
-- Policy helper derives identity only from auth.uid(); callers cannot probe arbitrary UUIDs.
create or replace function public.retention_blocked_for_current_user()
returns boolean language sql stable security definer set search_path = public, auth, pg_catalog as $$
 select auth.uid() is not null and private.retention_blocked(auth.uid())
$$;
revoke all on function public.retention_blocked_for_current_user() from public, anon;
grant execute on function public.retention_blocked_for_current_user() to authenticated;

-- Restrictive policies intersect with existing permissive policies. Ownership column audited from migrations.
do $$
declare t text; c text;
begin
 for t,c in select * from (values
 ('profiles','id'),('subscriptions','user_id'),('stores','user_id'),('messages','user_id'),('oauth_connection_attempts','user_id'),('payment_events','user_id'),('meta_ad_accounts','user_id'),('meta_attributions','user_id'),('meta_oauth_states','user_id'),('meta_integrations','user_id'),('admin_users','user_id'),('attribution_touches','user_id'),('vendeo_alerts','user_id'),('meta_campaign_mappings','user_id'),('ad_campaigns','user_id'),('tiktok_oauth_states','user_id'),('tiktok_integrations','user_id'),('tiktok_ad_accounts','user_id'),('campaign_product_links','user_id'),('reddit_oauth_states','user_id'),('reddit_integrations','user_id'),('reddit_ad_accounts','user_id'),('credit_accounts','user_id'),('credit_transactions','user_id'),('studio_generations','user_id'),('ad_wallet_transactions','user_id'),('conversations','user_id'),('ad_campaign_autopilot_reports','user_id'),('tiktok_campaign_mappings','user_id'),('meta_pixels','user_id'),('shop_storefronts','user_id'),('x_ads_oauth_states','user_id'),('x_ads_integrations','user_id'),('x_ads_accounts','user_id'),('user_notifications','user_id'),('pinterest_oauth_states','user_id'),('pinterest_integrations','user_id'),('pinterest_ad_accounts','user_id'),('usage_sessions','user_id'),('usage_section_stats','user_id'),('usage_intervals','user_id'),('app_feedback','user_id'),('web_push_subscriptions','user_id'),('chariow_celebration_baselines','user_id'),('shopify_connections','user_id'),('shopify_oauth_states','user_id')
 ) v(tab,col) loop
   if to_regclass('public.'||t) is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then
     execute format('alter table public.%I enable row level security',t);
     execute format('drop policy if exists account_retention_block on public.%I',t);
   execute format('create policy account_retention_block on public.%I as restrictive for all to authenticated using (not public.retention_blocked_for_current_user()) with check (not public.retention_blocked_for_current_user())',t);
   end if;
 end loop;
end $$;

-- Also guard RLS-enabled child/resource tables that identify ownership only through a parent FK.
do $$
declare t text;
begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relkind='r' and c.relrowsecurity
            and c.relname <> 'account_retention'
 loop
   execute format('drop policy if exists account_retention_block on public.%I',t);
   execute format('create policy account_retention_block on public.%I as restrictive for all to authenticated using (not public.retention_blocked_for_current_user()) with check (not public.retention_blocked_for_current_user())',t);
 end loop;
end $$;

create or replace function public.account_retention_status()
returns jsonb language plpgsql security definer set search_path = public, auth, pg_catalog as $$
declare u uuid:=auth.uid(); r public.account_retention; e timestamptz;
begin
 if u is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
 select email_confirmed_at into e from auth.users where id=u;
 if e is null then raise exception 'CONFIRMED_EMAIL_REQUIRED' using errcode='42501'; end if;
 select * into r from public.account_retention where user_id=u;
 return jsonb_build_object('state',case when r.deletion_deadline is null then 'active' when r.deletion_deadline>now() then 'pending' else 'expired' end,'purge_after',r.deletion_deadline);
end $$;
create or replace function public.request_account_deletion()
returns jsonb language plpgsql security definer set search_path = public, auth, pg_catalog as $$
declare u uuid:=auth.uid(); e timestamptz; address text; r public.account_retention;
begin
 if u is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
 select email_confirmed_at,email into e,address from auth.users where id=u for update;
 if e is null then raise exception 'CONFIRMED_EMAIL_REQUIRED' using errcode='42501'; end if;
 insert into private.retired_email_markers(email_hmac) values(private.email_retention_hmac(address)) on conflict do nothing;
 insert into public.account_retention(user_id,deletion_requested_at,deletion_deadline) values(u,now(),now()+interval '90 days')
 on conflict(user_id) do update set deletion_requested_at=coalesce(public.account_retention.deletion_requested_at,excluded.deletion_requested_at), deletion_deadline=coalesce(public.account_retention.deletion_deadline,excluded.deletion_deadline) returning * into r;
 return jsonb_build_object('state','pending','purge_after',r.deletion_deadline);
end $$;
create or replace function public.restore_account()
returns jsonb language plpgsql security definer set search_path = public, auth, pg_catalog as $$
declare u uuid:=auth.uid(); e timestamptz; d timestamptz; requested timestamptz; proof timestamptz;
begin
 if u is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
 select email_confirmed_at into e from auth.users where id=u for update;
 if e is null then raise exception 'CONFIRMED_EMAIL_REQUIRED' using errcode='42501'; end if;
 select deletion_deadline,deletion_requested_at into d,requested from public.account_retention where user_id=u for update;
 if d is null then return jsonb_build_object('restored',false,'reason','not_pending'); end if;
 if now()>=d then raise exception 'RESTORATION_DEADLINE_PASSED' using errcode='55000'; end if;
 select to_timestamp((v->>'timestamp')::double precision) into proof from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) v where v->>'method'='otp' and coalesce(v->>'timestamp','') ~ '^\d+$' order by (v->>'timestamp')::double precision desc limit 1;
 if proof is null or proof<requested then raise exception 'FRESH_EMAIL_OTP_REQUIRED' using errcode='42501'; end if;
 update public.account_retention set deletion_requested_at=null,deletion_deadline=null where user_id=u;
 return jsonb_build_object('restored',true);
end $$;
create or replace function public.purge_expired_accounts(p_limit integer default 100)
returns integer language plpgsql security definer set search_path = public, auth, pg_catalog as $$
declare ids uuid[]; n integer;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 if p_limit<1 or p_limit>1000 then raise exception 'INVALID_LIMIT'; end if;
 select array_agg(user_id) into ids from (select user_id from public.account_retention where deletion_deadline<=now() order by deletion_deadline limit p_limit) q;
 if ids is null then return 0; end if;
 -- All lifecycle RPCs lock auth.users first and retention second. Recheck deadline under those locks.
 perform 1 from auth.users where id=any(ids) order by id for update;
 perform 1 from public.account_retention where user_id=any(ids) order by user_id for update;
 ids := array(select r.user_id from public.account_retention r join auth.users u on u.id=r.user_id where r.user_id=any(ids) and r.deletion_deadline<=clock_timestamp());
 if cardinality(ids)=0 then return 0; end if;
 -- Scrub payload-bearing rows even when their FK/cascade semantics vary across schema versions.
 delete from public.payment_events where user_id=any(ids);
 if to_regclass('public.chariow_pulse_events') is not null then
   delete from public.chariow_pulse_events where store_id in (select id from public.stores where user_id=any(ids));
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_feedback' and column_name='replied_by') then
   update public.app_feedback set reply=null,replied_at=null,replied_by=null where replied_by=any(ids);
 end if;
 if to_regclass('public.platform_audit_logs') is not null then
   delete from public.platform_audit_logs where actor_user_id=any(ids) or resource_id=any(select unnest(ids)::text);
 end if;
 -- Marker any pre-migration account before auth cascade removes its email.
 insert into private.retired_email_markers(email_hmac)
 select private.email_retention_hmac(u.email) from auth.users u where u.id=any(ids) and u.email is not null
 on conflict do nothing;
 -- auth.users deletion cascades declared FK relations. External storage objects and non-FK services are deliberately not touched.
 delete from auth.users where id=any(ids);
 get diagnostics n=row_count;
 delete from public.account_retention where user_id=any(ids);
 return n;
end $$;
revoke all on function public.account_retention_status() from public, anon;
revoke all on function public.request_account_deletion() from public, anon;
revoke all on function public.restore_account() from public, anon;
revoke all on function public.purge_expired_accounts(integer) from public, anon, authenticated;
grant execute on function public.account_retention_status() to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.restore_account() to authenticated;
grant execute on function public.purge_expired_accounts(integer) to service_role;
