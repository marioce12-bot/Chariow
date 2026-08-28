alter table public.subscriptions
  add column if not exists free_messages_used integer not null default 0
    check (free_messages_used >= 0 and free_messages_used <= 3),
  add column if not exists free_messages_limit integer not null default 3
    check (free_messages_limit = 3);

create or replace function public.consume_message_quota(target_user_id uuid)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare result public.subscriptions;
begin
  perform public.reset_subscription_period_if_needed(target_user_id);

  update public.subscriptions
  set free_messages_used = free_messages_used + 1,
      updated_at = now()
  where user_id = target_user_id
    and status = 'active'
    and free_messages_used < free_messages_limit
  returning * into result;

  if result.id is not null then return result; end if;

  update public.subscriptions
  set messages_used_this_month = messages_used_this_month + 1,
      updated_at = now()
  where user_id = target_user_id
    and status = 'active'
    and messages_used_this_month < messages_limit
  returning * into result;

  return result;
end;
$$;

revoke all on function public.consume_message_quota(uuid) from public, anon, authenticated;
