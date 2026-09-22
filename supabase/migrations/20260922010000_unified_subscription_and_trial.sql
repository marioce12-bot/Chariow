-- Forfait unique Vendeo : 2 000 XOF/mois, 3 boutiques, essai de 15 jours.
-- Le Studio reste séparé et fonctionne uniquement avec le solde de crédits.

alter table public.subscriptions
  alter column trial_ends_at set default (now() + interval '15 days');

update public.subscriptions
set plan = 'starter',
    trial_ends_at = case when trial_active then created_at + interval '15 days' else trial_ends_at end,
    updated_at = now();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do update set email = excluded.email;
  insert into public.subscriptions (user_id, plan, status, trial_active, trial_ends_at, messages_limit)
  values (new.id, 'starter', 'trialing', true, now() + interval '15 days', 400)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.expire_trials()
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  update public.subscriptions
  set status = 'past_due', updated_at = now()
  where trial_active = true and status = 'trialing' and trial_ends_at < now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.consume_message_quota(target_user_id uuid)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare result public.subscriptions;
begin
  perform public.reset_subscription_period_if_needed(target_user_id);
  update public.subscriptions
  set messages_used_this_month = messages_used_this_month + 1, updated_at = now()
  where user_id = target_user_id
    and ((status in ('trialing', 'active') and trial_active = true and now() < trial_ends_at)
      or (status = 'active' and trial_active = false))
  returning * into result;
  return result;
end;
$$;

-- Crédit Studio de bienvenue : 75 crédits pour les comptes existants et futurs.
insert into public.credit_accounts (user_id, balance)
select p.id, 75
from public.profiles p
where not exists (select 1 from public.credit_transactions t where t.user_id = p.id and t.operation = 'welcome_credits')
on conflict (user_id) do update set balance = public.credit_accounts.balance + 75
where not exists (select 1 from public.credit_transactions t where t.user_id = excluded.user_id and t.operation = 'welcome_credits');

insert into public.credit_transactions (user_id, kind, credits, balance_before, balance_after, operation, metadata)
select p.id, 'purchase', 75, 0, 75, 'welcome_credits', jsonb_build_object('source', 'signup')
from public.profiles p
where not exists (select 1 from public.credit_transactions t where t.user_id = p.id and t.operation = 'welcome_credits');

create or replace function public.handle_new_user_credit_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.credit_accounts (user_id, balance) values (new.id, 75) on conflict (user_id) do nothing;
  insert into public.credit_transactions (user_id, kind, credits, balance_before, balance_after, operation, metadata)
  values (new.id, 'purchase', 75, 0, 75, 'welcome_credits', jsonb_build_object('source', 'signup'));
  return new;
end;
$$;
