-- Préparation dédiée à l'offre de crédits de novembre 2026.
-- Cette migration n'est pas appliquée automatiquement dans le cadre de la préparation.

create table if not exists public.transactional_credit_offer_recipients (
  campaign_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  account_created_at timestamptz not null,
  batch_name text not null check (batch_name in ('first', 'remainder')),
  grant_id text not null unique,
  credit_status text not null default 'pending'
    check (credit_status in ('pending', 'granted', 'failed')),
  credit_granted_at timestamptz,
  email_status text not null default 'pending'
    check (email_status in ('pending', 'attempting', 'accepted', 'rejected', 'unknown', 'suppressed')),
  email_attempted_at timestamptz,
  email_accepted_at timestamptz,
  email_message_id text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create index if not exists transactional_credit_offer_recipients_batch_idx
  on public.transactional_credit_offer_recipients (campaign_id, batch_name, account_created_at, user_id);

alter table public.transactional_credit_offer_recipients enable row level security;
revoke all on table public.transactional_credit_offer_recipients from public, anon, authenticated;
grant select, insert, update, delete on table public.transactional_credit_offer_recipients to service_role;

create table if not exists public.admin_trial_extension_grants (
  campaign_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  old_trial_ends_at timestamptz not null,
  new_trial_ends_at timestamptz not null,
  applied_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

alter table public.admin_trial_extension_grants enable row level security;
revoke all on table public.admin_trial_extension_grants from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_trial_extension_grants to service_role;

create or replace function public.admin_extend_expired_trial_three_days(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_row public.subscriptions%rowtype;
  prior_grant public.admin_trial_extension_grants%rowtype;
  new_end timestamptz;
  campaign constant text := 'vendeo-trial-extension-3d-2026-11';
begin
  select * into subscription_row
  from public.subscriptions
  where user_id = target_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'eligible', false, 'reason', 'subscription_not_found');
  end if;

  select * into prior_grant
  from public.admin_trial_extension_grants
  where campaign_id = campaign and user_id = target_user_id;

  if found then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'trial_ends_at', prior_grant.new_trial_ends_at
    );
  end if;

  if subscription_row.trial_active is distinct from true
     or subscription_row.status <> 'past_due'
     or subscription_row.trial_ends_at is null
     or subscription_row.trial_ends_at >= now() then
    return jsonb_build_object('ok', false, 'eligible', false, 'reason', 'not_an_expired_trial');
  end if;

  if exists (
    select 1
    from public.subscriptions paid
    where paid.user_id = target_user_id
      and paid.status = 'active'
      and paid.trial_active = false
      and paid.current_period_end >= current_date
  ) then
    return jsonb_build_object('ok', false, 'eligible', false, 'reason', 'active_paid_entitlement');
  end if;

  -- Re-open for three days from now if the old end is already past; otherwise
  -- preserve the existing future end and add exactly three days to it.
  new_end := greatest(subscription_row.trial_ends_at, now()) + interval '3 days';

  update public.subscriptions
  set status = 'trialing',
      trial_active = true,
      trial_ends_at = new_end,
      updated_at = now()
  where id = subscription_row.id;

  insert into public.admin_trial_extension_grants (
    campaign_id, user_id, old_trial_ends_at, new_trial_ends_at
  ) values (
    campaign, target_user_id, subscription_row.trial_ends_at, new_end
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'old_trial_ends_at', subscription_row.trial_ends_at,
    'trial_ends_at', new_end
  );
end;
$$;

revoke all on function public.admin_extend_expired_trial_three_days(uuid) from public, anon, authenticated;
grant execute on function public.admin_extend_expired_trial_three_days(uuid) to service_role;
