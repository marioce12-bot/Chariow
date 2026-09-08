-- Vendeo n'a plus qu'un seul abonnement (2 000 XOF/mois, essai gratuit de 7 jours).
-- Tant que l'essai est en cours ou que l'abonnement est actif, l'usage de Vendeo AI
-- est illimité : on retire donc le plafond `messages_used_this_month < messages_limit`
-- de consume_message_quota. Le seul critère qui bloque désormais l'accès est la
-- validité du compte (essai en cours et non expiré, ou abonnement payant actif).
--
-- Les colonnes messages_used_this_month / messages_limit / free_messages_used /
-- free_messages_limit sont conservées telles quelles (utiles pour les statistiques
-- internes et pour ne pas casser des lectures existantes), mais elles ne conditionnent
-- plus l'accès au chat IA.
create or replace function public.consume_message_quota(target_user_id uuid)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare result public.subscriptions;
begin
  perform public.reset_subscription_period_if_needed(target_user_id);

  -- Essai gratuit de 7 jours à partir de la création du compte : accès illimité
  -- tant que la date trial_ends_at n'est pas dépassée.
  update public.subscriptions
  set messages_used_this_month = messages_used_this_month + 1, updated_at = now()
  where user_id = target_user_id
    and status in ('trialing', 'active')
    and trial_active = true
    and now() < trial_ends_at
  returning * into result;
  if result.id is not null then return result; end if;

  -- Abonnement payant actif (essai terminé ou jamais activé) : accès illimité.
  update public.subscriptions
  set messages_used_this_month = messages_used_this_month + 1, updated_at = now()
  where user_id = target_user_id
    and status = 'active'
    and trial_active = false
  returning * into result;
  return result;
end;
$$;
