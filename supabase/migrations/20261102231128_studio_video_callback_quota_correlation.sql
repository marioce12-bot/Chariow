begin;

-- La route callback ne doit pas utiliser l’ancien quota générique: la génération
-- vidéo courante réserve studio_video_daily_quota.
create or replace function public.release_studio_video_quota_after_refund(
  p_user_id uuid,
  p_generation_id uuid,
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_status text;
begin
  if p_user_id is null or p_generation_id is null or p_transaction_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;
  if not exists (
    select 1 from public.credit_transactions
    where id = p_transaction_id and user_id = p_user_id and kind = 'debit' and status = 'refunded'
  ) then
    return jsonb_build_object('ok', false, 'code', 'REFUND_NOT_CONFIRMED');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select status into v_status from public.studio_video_daily_quota
  where generation_id = p_generation_id and user_id = p_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'QUOTA_RESERVATION_NOT_FOUND'); end if;
  if v_status = 'released' then return jsonb_build_object('ok', true, 'duplicate', true, 'state', 'released'); end if;
  if v_status in ('completed', 'failed_spent') then return jsonb_build_object('ok', false, 'code', 'TERMINAL_STATE', 'state', v_status); end if;
  update public.studio_video_daily_quota set status = 'released', updated_at = now()
  where generation_id = p_generation_id and user_id = p_user_id;
  return jsonb_build_object('ok', true, 'state', 'released');
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
  select * into v_generation from public.studio_generations where id = p_generation_id for update;
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
  if v_generation.credit_transaction_id is null or not exists (
    select 1 from public.credit_transactions
    where id = v_generation.credit_transaction_id and user_id = v_generation.user_id
      and kind = 'debit' and status in ('pending', 'completed')
  ) then return false; end if;
  if not public.complete_credit_debit(v_generation.credit_transaction_id) then return false; end if;
  v_quota := public.set_studio_video_quota_state(v_generation.user_id, v_generation.id, 'completed');
  if coalesce((v_quota->>'ok')::boolean, false) is not true then
    raise exception 'studio_video_quota_completion_failed';
  end if;
  update public.studio_generations
  set status = 'completed', error = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'phase', 'completed', 'progress', 100, 'creditState', 'consumed',
        'userMessage', 'Vidéo prête.', 'updatedAt', v_now
      ),
      provider_callback_lease_token = null, provider_callback_lease_until = null
  where id = v_generation.id and status = 'processing' and provider_callback_status = 'OK'
    and provider_callback_lease_token = p_lease_token and provider_callback_lease_until > v_now
    and storage_path = p_storage_path;
  return found;
end;
$$;

create or replace function public.finish_studio_video_callback(
  p_generation_id uuid,
  p_lease_token uuid,
  p_final_status text,
  p_storage_path text default null,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_now timestamptz := clock_timestamp();
begin
  if p_generation_id is null or p_lease_token is null or p_final_status is distinct from 'failed' then return false; end if;
  update public.studio_generations
  set status = 'failed', error = coalesce(p_error, 'fal.ai n''a pas pu terminer la génération vidéo.'),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'phase', 'failed', 'progress', 100, 'creditState', 'refunded',
        'userMessage', coalesce(p_error, 'fal.ai n''a pas pu terminer la génération vidéo.'), 'updatedAt', v_now
      ),
      provider_callback_lease_token = null, provider_callback_lease_until = null
  where id = p_generation_id and kind = 'video' and status = 'processing'
    and provider_callback_lease_token = p_lease_token and provider_callback_lease_until > v_now
    and provider_callback_status in ('OK', 'ERROR')
    and storage_path is not distinct from p_storage_path;
  return found;
end;
$$;

revoke all on function public.release_studio_video_quota_after_refund(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_studio_video_callback(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finish_studio_video_callback(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.release_studio_video_quota_after_refund(uuid, uuid, uuid) to service_role;
grant execute on function public.complete_studio_video_callback(uuid, uuid, text) to service_role;
grant execute on function public.finish_studio_video_callback(uuid, uuid, text, text, text) to service_role;

commit;
