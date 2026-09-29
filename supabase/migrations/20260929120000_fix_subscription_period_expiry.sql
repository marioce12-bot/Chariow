-- Correctif abonnement : la période payante ne doit plus jamais être prolongée
-- gratuitement.
--
-- Avant : reset_subscription_period_if_needed() repoussait current_period_end à
-- la fin du mois courant dès que la date était dépassée, sans vérifier aucun
-- paiement. Elle est appelée à chaque GET /api/subscription et à chaque message,
-- donc un abonné échu était renouvelé gratuitement et le cron ne le trouvait
-- jamais expiré.
--
-- Maintenant :
--   * un essai dont trial_ends_at est dépassé passe en 'past_due' ;
--   * un abonnement payant dont current_period_end est dépassé passe en
--     'past_due' ;
--   * la période n'est JAMAIS prolongée ici : seul un paiement confirmé
--     (webhook SasPay ou activation admin) peut fixer une nouvelle période.

create or replace function public.reset_subscription_period_if_needed(target_user_id uuid)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare result public.subscriptions;
begin
  -- Essai gratuit terminé.
  update public.subscriptions
  set status = 'past_due', updated_at = now()
  where user_id = target_user_id
    and trial_active = true
    and status = 'trialing'
    and trial_ends_at < now();

  -- Abonnement payant arrivé à échéance : accès coupé jusqu'au prochain paiement.
  update public.subscriptions
  set status = 'past_due', updated_at = now()
  where user_id = target_user_id
    and trial_active = false
    and status = 'active'
    and current_period_end < current_date;

  select * into result from public.subscriptions where user_id = target_user_id;
  return result;
end;
$$;

-- Filet de sécurité quotidien (cron /api/cron/subscriptions/expire) : expire
-- aussi les abonnements payants échus, pas seulement les essais.
create or replace function public.expire_trials()
returns integer language plpgsql security definer set search_path = public as $$
declare
  expired_trials integer;
  expired_paid integer;
begin
  update public.subscriptions
  set status = 'past_due', updated_at = now()
  where trial_active = true
    and status = 'trialing'
    and trial_ends_at < now();
  get diagnostics expired_trials = row_count;

  update public.subscriptions
  set status = 'past_due', updated_at = now()
  where trial_active = false
    and status = 'active'
    and current_period_end < current_date;
  get diagnostics expired_paid = row_count;

  return expired_trials + expired_paid;
end;
$$;

revoke all on function public.reset_subscription_period_if_needed(uuid) from public, anon, authenticated;
revoke all on function public.expire_trials() from public, anon, authenticated;
