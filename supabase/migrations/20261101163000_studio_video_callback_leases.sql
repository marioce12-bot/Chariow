begin;

alter table public.studio_generations
  add column if not exists provider_callback_status text,
  add column if not exists provider_callback_lease_token uuid,
  add column if not exists provider_callback_lease_until timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'studio_generations_provider_callback_status_check'
      and conrelid = 'public.studio_generations'::regclass
  ) then
    alter table public.studio_generations
      add constraint studio_generations_provider_callback_status_check
      check (provider_callback_status is null or provider_callback_status in ('OK', 'ERROR'));
  end if;
end;
$$;

create or replace function public.claim_studio_video_callback(
  p_request_id text,
  p_user_id uuid,
  p_callback_status text,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_generation public.studio_generations%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_request_id is null or length(p_request_id) < 1 or length(p_request_id) > 256
     or p_user_id is null or p_lease_token is null
     or p_callback_status is null or p_callback_status not in ('OK', 'ERROR') then
    return jsonb_build_object('outcome', 'invalid_request');
  end if;

  select * into v_generation
  from public.studio_generations
  where provider_request_id = p_request_id
  for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if v_generation.kind <> 'video' or v_generation.user_id <> p_user_id then
    return jsonb_build_object('outcome', 'owner_mismatch');
  end if;
  if v_generation.status <> 'processing' then
    return jsonb_build_object('outcome', 'terminal', 'status', v_generation.status);
  end if;
  if v_generation.provider_callback_status is not null
     and v_generation.provider_callback_status <> p_callback_status then
    return jsonb_build_object('outcome', 'conflict');
  end if;
  if v_generation.provider_callback_lease_until > v_now
     and v_generation.provider_callback_lease_token is distinct from p_lease_token then
    return jsonb_build_object('outcome', 'busy', 'retry_after', v_generation.provider_callback_lease_until);
  end if;

  update public.studio_generations
  set provider_callback_status = coalesce(provider_callback_status, p_callback_status),
      provider_callback_lease_token = p_lease_token,
      provider_callback_lease_until = v_now + interval '3 minutes'
  where id = v_generation.id
  returning * into v_generation;

  return jsonb_build_object(
    'outcome', 'claimed',
    'generation', jsonb_build_object(
      'id', v_generation.id,
      'user_id', v_generation.user_id,
      'kind', v_generation.kind,
      'status', v_generation.status,
      'credit_transaction_id', v_generation.credit_transaction_id,
      'storage_path', v_generation.storage_path
    )
  );
end;
$$;

create or replace function public.record_studio_video_callback_asset(
  p_generation_id uuid,
  p_lease_token uuid,
  p_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_generation_id is null or p_lease_token is null or p_storage_path is null or length(p_storage_path) > 4096 then
    return false;
  end if;
  update public.studio_generations
  set storage_path = coalesce(storage_path, p_storage_path)
  where id = p_generation_id
    and kind = 'video'
    and status = 'processing'
    and provider_callback_status = 'OK'
    and provider_callback_lease_token = p_lease_token
    and (storage_path is null or storage_path = p_storage_path);
  return found;
end;
$$;

create or replace function public.finish_studio_video_callback(
  p_generation_id uuid,
  p_lease_token uuid,
  p_final_status text,
  p_storage_path text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_generation_id is null or p_lease_token is null or p_final_status is distinct from 'failed'
     or (p_error is not null and length(p_error) > 500) then
    return false;
  end if;
  update public.studio_generations
  set status = 'failed',
      error = p_error,
      provider_callback_lease_token = null,
      provider_callback_lease_until = null
  where id = p_generation_id
    and kind = 'video'
    and status = 'processing'
    and provider_callback_lease_token = p_lease_token
    and provider_callback_status is not null;
  return found;
end;
$$;

create or replace function public.complete_studio_video_callback(
  p_generation_id uuid,
  p_lease_token uuid,
  p_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_generation public.studio_generations%rowtype;
  v_quota jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_generation_id is null or p_lease_token is null or p_storage_path is null or length(p_storage_path) > 4096 then
    return false;
  end if;

  select * into v_generation
  from public.studio_generations
  where id = p_generation_id
  for update;
  if not found
     or v_generation.kind is distinct from 'video'
     or v_generation.status is distinct from 'processing'
     or v_generation.provider_callback_status is distinct from 'OK'
     or v_generation.provider_callback_lease_token is distinct from p_lease_token
     or v_generation.provider_callback_lease_until is null
     or v_generation.provider_callback_lease_until <= v_now
     or v_generation.storage_path is distinct from p_storage_path then
    return false;
  end if;

  if v_generation.credit_transaction_id is not null then
    if not exists (
      select 1 from public.credit_transactions
      where id = v_generation.credit_transaction_id
        and user_id = v_generation.user_id
        and kind = 'debit'
        and status in ('pending', 'completed')
    ) then
      return false;
    end if;
    if not public.complete_credit_debit(v_generation.credit_transaction_id) then
      return false;
    end if;
  end if;

  v_quota := public.complete_video_slot(v_generation.user_id, v_generation.id);
  if coalesce((v_quota->>'completed')::boolean, false) is not true then
    -- Raising rolls back the debit above as well as all other writes in this RPC.
    raise exception 'studio_video_quota_completion_failed';
  end if;

  update public.studio_generations
  set status = 'completed',
      error = null,
      provider_callback_lease_token = null,
      provider_callback_lease_until = null
  where id = v_generation.id
    and status = 'processing'
    and provider_callback_status = 'OK'
    and provider_callback_lease_token = p_lease_token
    and provider_callback_lease_until > v_now
    and storage_path = p_storage_path;
  return found;
end;
$$;

create or replace function public.fail_stale_studio_video_generation(
  p_generation_id uuid,
  p_created_before timestamptz,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_generation_id is null or p_created_before is null or p_error is null or length(p_error) > 500 then
    return false;
  end if;
  update public.studio_generations
  set status = 'failed',
      error = p_error,
      provider_callback_lease_token = null,
      provider_callback_lease_until = null
  where id = p_generation_id
    and kind = 'video'
    and status = 'processing'
    and created_at < p_created_before
    and (provider_callback_lease_until is null or provider_callback_lease_until <= clock_timestamp());
  return found;
end;
$$;

revoke all on function public.claim_studio_video_callback(text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.record_studio_video_callback_asset(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finish_studio_video_callback(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_studio_video_callback(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fail_stale_studio_video_generation(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.claim_studio_video_callback(text, uuid, text, uuid) to service_role;
grant execute on function public.record_studio_video_callback_asset(uuid, uuid, text) to service_role;
grant execute on function public.finish_studio_video_callback(uuid, uuid, text, text, text) to service_role;
grant execute on function public.complete_studio_video_callback(uuid, uuid, text) to service_role;
grant execute on function public.fail_stale_studio_video_generation(uuid, timestamptz, text) to service_role;

commit;
