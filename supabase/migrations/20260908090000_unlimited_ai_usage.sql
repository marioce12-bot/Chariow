-- Suppression du quota de messages IA.
-- Jusqu'ici, consume_message_quota bloquait l'accès à l'IA dès que
-- messages_used_this_month atteignait messages_limit, même pour un abonné
-- payant à jour. Ce n'est plus le comportement voulu : tant que l'essai
-- gratuit de 7 jours est en cours (trial_active = true et trial_ends_at non
-- dépassé) OU que l'abonnement Vendeo (2 000 XOF/mois) est actif, l'usage de
-- l'assistant IA est illimité. Le seul cas de blocage est un compte dont
-- l'essai ET l'abonnement sont tous les deux expirés (status = 'past_due').
--
-- messages_used_this_month est conservé (à titre statistique uniquement,
-- affiché nulle part côté produit) mais n'est plus comparé à messages_limit.

create or replace function public.consume_message_quota(target_user_id uuid)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare result public.subscriptions;
begin
  perform public.reset_subscription_period_if_needed(target_user_id);

  -- Essai gratuit de 7 jours : accès illimité tant que trial_ends_at n'est
  -- pas dépassée.
  update public.subscriptions
  set messages_used_this_month = messages_used_this_month + 1, updated_at = now()
  where user_id = target_user_id
    and status in ('trialing', 'active')
    and trial_active = true
    and now() < trial_ends_at
  returning * into result;
  if result.id is not null then return result; end if;

  -- Abonnement payant actif (essai terminé ou jamais activé) : accès
  -- illimité, aucun quota de messages.
  update public.subscriptions
  set messages_used_this_month = messages_used_this_month + 1, updated_at = now()
  where user_id = target_user_id
    and status = 'active'
    and trial_active = false
  returning * into result;
  return result;
end;
$$;
