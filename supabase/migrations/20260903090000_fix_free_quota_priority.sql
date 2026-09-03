-- Fix: consume_message_quota consommait le quota d'essai gratuit (free_messages_used)
-- même pour les utilisateurs ayant un abonnement payant actif (trial_active = false),
-- ce qui laissait "Messages utilisés" affiché à 0/limite sur les plans payants tant que
-- les 3 messages gratuits n'étaient pas symboliquement épuisés.
-- Fix : le quota d'essai gratuit n'est consommé que si l'utilisateur est réellement en essai
-- (trial_active = true). Sinon on va directement sur le quota mensuel du plan payant.

create or replace function public.consume_message_quota(target_user_id uuid)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare result public.subscriptions;
begin
  perform public.reset_subscription_period_if_needed(target_user_id);

  update public.subscriptions
  set free_messages_used = free_messages_used + 1, updated_at = now()
  where user_id = target_user_id
    and status in ('trialing', 'active')
    and trial_active = true
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

-- Rattrapage : les comptes déjà sur un plan payant (trial_active = false) mais dont
-- free_messages_used > 0 ont potentiellement des messages "invisibles" côté compteur mensuel.
-- On ne peut pas reconstituer l'historique exact, donc on se contente de ne plus les bloquer :
-- rien à migrer côté données, le comportement futur est corrigé par la fonction ci-dessus.
