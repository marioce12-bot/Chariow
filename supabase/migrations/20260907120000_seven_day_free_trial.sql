-- Passage d'un essai gratuit "3 messages" à un essai gratuit de 7 jours calendaires
-- à partir de la création du compte. Une fois ces 7 jours écoulés, l'accès au chat IA
-- est bloqué (consume_message_quota renverra null) tant que l'abonnement unique Vendeo
-- (2000 XOF/mois) n'a pas été activé. Le frontend affiche alors une pop-up d'activation
-- quand subscriptions.status = 'past_due'.

alter table public.subscriptions
  add column if not exists trial_ends_at timestamptz;

-- Comptes déjà en essai : 7 jours à partir de la création réelle du compte,
-- pas à partir de maintenant, pour ne pas prolonger artificiellement leur essai.
update public.subscriptions
set trial_ends_at = created_at + interval '7 days'
where trial_ends_at is null;

alter table public.subscriptions
  alter column trial_ends_at set default (now() + interval '7 days'),
  alter column trial_ends_at set not null;

create or replace function public.consume_message_quota(target_user_id uuid)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare result public.subscriptions;
begin
  perform public.reset_subscription_period_if_needed(target_user_id);

  -- Essai gratuit : accès complet au quota mensuel du plan tant que les 7 jours
  -- depuis la création du compte ne sont pas écoulés.
  update public.subscriptions
  set messages_used_this_month = messages_used_this_month + 1, updated_at = now()
  where user_id = target_user_id
    and status in ('trialing', 'active')
    and trial_active = true
    and now() < trial_ends_at
    and messages_used_this_month < messages_limit
  returning * into result;
  if result.id is not null then return result; end if;

  -- Abonnement payant actif (essai terminé ou jamais activé).
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

-- Filet de sécurité quotidien (cron) : bascule les essais expirés en 'past_due'
-- pour que le frontend affiche la pop-up d'activation d'abonnement, même si
-- l'utilisateur n'a pas retenté d'envoyer de message depuis l'expiration.
create or replace function public.expire_trials()
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  update public.subscriptions
  set status = 'past_due', updated_at = now()
  where trial_active = true
    and status = 'trialing'
    and trial_ends_at < now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.expire_trials() from public, anon, authenticated;
