-- Vendeo referral program. This migration is intentionally stored in the repo
-- for review and manual application; it is not applied to any remote database.

create table if not exists public.referral_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique check (code ~ '^[A-F0-9]{24}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid not null unique references public.profiles(id) on delete cascade,
  referral_code text not null,
  created_at timestamptz not null default now(),
  constraint referrals_no_self_referral check (referrer_user_id <> referred_user_id)
);

create index if not exists referrals_referrer_created_idx
  on public.referrals (referrer_user_id, created_at desc);

create table if not exists public.referral_subscription_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  milestone_count integer not null check (milestone_count > 0 and mod(milestone_count, 25) = 0),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  starts_on date,
  ends_on date,
  constraint referral_reward_activation_dates_check check (
    (activated_at is null and starts_on is null and ends_on is null)
    or (activated_at is not null and starts_on is not null and ends_on is not null and ends_on >= starts_on)
  ),
  constraint referral_subscription_rewards_milestone_unique unique (referrer_user_id, milestone_count)
);

create index if not exists referral_rewards_available_idx
  on public.referral_subscription_rewards (referrer_user_id, milestone_count)
  where activated_at is null;

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_subscription_rewards enable row level security;

-- The browser never reads these tables directly. Authenticated routes use the
-- service role only after requireUser() has established the caller's identity.
revoke all on table public.referral_codes, public.referrals, public.referral_subscription_rewards from public, anon, authenticated;
grant all on table public.referral_codes, public.referrals, public.referral_subscription_rewards to service_role;

create or replace function public.ensure_referral_code_for_user(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_code text;
  candidate text;
begin
  select code into existing_code
  from public.referral_codes
  where user_id = target_user_id;
  if existing_code is not null then return existing_code; end if;

  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 24));
    begin
      insert into public.referral_codes (user_id, code)
      values (target_user_id, candidate);
      return candidate;
    exception when unique_violation then
      select code into existing_code
      from public.referral_codes
      where user_id = target_user_id;
      if existing_code is not null then return existing_code; end if;
      -- A code collision is exceptionally unlikely; retry with a fresh random code.
    end;
  end loop;
end;
$$;

revoke all on function public.ensure_referral_code_for_user(uuid) from public, anon, authenticated;
grant execute on function public.ensure_referral_code_for_user(uuid) to service_role;

-- Give existing accounts a personal link, without inventing historical referrals
-- or granting historical credits/subscriptions.
do $$
declare
  profile_row record;
begin
  for profile_row in select id from public.profiles loop
    perform public.ensure_referral_code_for_user(profile_row.id);
  end loop;
end;
$$;

create or replace function public.handle_new_user_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  submitted_code text;
  referrer_id uuid;
  new_referral_id uuid;
  account_balance integer;
  referral_total integer;
begin
  -- Ensure the newly created user also gets a code for their own future invites.
  perform public.ensure_referral_code_for_user(new.id);

  submitted_code := upper(btrim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));
  if submitted_code = '' then return new; end if;

  select user_id into referrer_id
  from public.referral_codes
  where code = submitted_code;
  if referrer_id is null or referrer_id = new.id then return new; end if;
  if exists (
    select 1 from public.profiles
    where id = referrer_id
      and lower(btrim(coalesce(email, ''))) = lower(btrim(coalesce(new.email, '')))
  ) then return new; end if;

  -- Serialize signups for the same referrer so 25th/50th milestones are not missed.
  perform id from public.profiles where id = referrer_id for update;

  insert into public.referrals (referrer_user_id, referred_user_id, referral_code)
  values (referrer_id, new.id, submitted_code)
  on conflict (referred_user_id) do nothing
  returning id into new_referral_id;
  if new_referral_id is null then return new; end if;

  -- Add one 150-credit reward for this newly created account only. The referral
  -- row's unique referred_user_id and the external ledger ID make retries safe.
  insert into public.credit_accounts (user_id, balance)
  values (referrer_id, 0)
  on conflict (user_id) do nothing;
  select balance into account_balance
  from public.credit_accounts
  where user_id = referrer_id
  for update;

  update public.credit_accounts
  set balance = balance + 150, updated_at = now()
  where user_id = referrer_id;

  insert into public.credit_transactions (
    user_id, kind, credits, balance_before, balance_after, operation,
    external_id, status, metadata
  ) values (
    referrer_id, 'purchase', 150, account_balance, account_balance + 150,
    'referral_signup_bonus', 'referral_signup_' || new_referral_id::text,
    'completed', jsonb_build_object(
      'source', 'referral_signup',
      'referral_id', new_referral_id,
      'referred_user_id', new.id
    )
  );

  select count(*) into referral_total
  from public.referrals
  where referrer_user_id = referrer_id;
  if referral_total > 0 and mod(referral_total, 25) = 0 then
    insert into public.referral_subscription_rewards (referrer_user_id, milestone_count)
    values (referrer_id, referral_total)
    on conflict (referrer_user_id, milestone_count) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user_referral() from public, anon, authenticated;

drop trigger if exists on_auth_user_referral on auth.users;
create trigger on_auth_user_referral
after insert on auth.users
for each row execute function public.handle_new_user_referral();

create or replace function public.activate_referral_subscription_reward(
  target_user_id uuid,
  target_reward_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reward_row public.referral_subscription_rewards;
  subscription_row public.subscriptions;
  base_end date;
  reward_start date;
  reward_end date;
begin
  select * into reward_row
  from public.referral_subscription_rewards
  where id = target_reward_id
    and referrer_user_id = target_user_id
  for update;

  if reward_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'reward_not_found');
  end if;

  if reward_row.activated_at is not null then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'reward_id', reward_row.id,
      'milestone_count', reward_row.milestone_count,
      'starts_on', reward_row.starts_on,
      'ends_on', reward_row.ends_on
    );
  end if;

  select * into subscription_row
  from public.subscriptions
  where user_id = target_user_id
  for update;
  if subscription_row.user_id is null then
    return jsonb_build_object('ok', false, 'code', 'subscription_not_found');
  end if;

  -- Never shorten existing access. The free month follows a still-valid paid
  -- period or trial; an expired account starts the gift immediately.
  if subscription_row.status = 'active'
     and subscription_row.trial_active = false
     and subscription_row.current_period_end >= current_date then
    base_end := subscription_row.current_period_end;
    reward_start := base_end + 1;
  elsif subscription_row.status = 'trialing'
     and subscription_row.trial_active = true
     and subscription_row.trial_ends_at >= now() then
    base_end := greatest(current_date, subscription_row.trial_ends_at::date);
    reward_start := base_end + 1;
  else
    base_end := current_date;
    reward_start := current_date;
  end if;

  -- Vendeo's paid plan period is 30 days from its period boundary.
  reward_end := base_end + 30;

  update public.subscriptions
  set plan = 'starter',
      status = 'active',
      trial_active = false,
      current_period_start = case
        when subscription_row.status = 'active'
         and subscription_row.trial_active = false
         and subscription_row.current_period_end >= current_date
        then subscription_row.current_period_start
        else current_date
      end,
      current_period_end = reward_end,
      updated_at = now()
  where user_id = target_user_id;

  update public.referral_subscription_rewards
  set activated_at = now(),
      starts_on = reward_start,
      ends_on = reward_end
  where id = reward_row.id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'reward_id', reward_row.id,
    'milestone_count', reward_row.milestone_count,
    'starts_on', reward_start,
    'ends_on', reward_end
  );
end;
$$;

revoke all on function public.activate_referral_subscription_reward(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_referral_subscription_reward(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
