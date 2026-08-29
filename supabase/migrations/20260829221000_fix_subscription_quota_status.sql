alter table public.subscriptions alter column status set default 'trialing';

update public.subscriptions
set status = 'trialing'
where trial_active = true and status = 'active';

create or replace function public.consume_message_quota(target_user_id uuid)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare result public.subscriptions;
begin
  perform public.reset_subscription_period_if_needed(target_user_id);

  update public.subscriptions
  set free_messages_used = free_messages_used + 1, updated_at = now()
  where user_id = target_user_id
    and status in ('trialing', 'active')
    and free_messages_used < free_messages_limit
  returning * into result;
  if result.id is not null then return result; end if;

  update public.subscriptions
  set messages_used_this_month = messages_used_this_month + 1, updated_at = now()
  where user_id = target_user_id
    and status = 'active'
    and trial_active = false
    and messages_used_this_month < messages_limit
  returning * into result;
  return result;
end;
$$;
