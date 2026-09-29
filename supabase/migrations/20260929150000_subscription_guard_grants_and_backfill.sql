-- Complément du correctif abonnement (garde sur toutes les routes /api).
--
-- 1. La migration 20260929120000 se termine par
--      revoke all on function reset_subscription_period_if_needed(uuid)
--        from public, anon, authenticated;
--    alors que GET /api/subscription l'appelle avec le client Supabase de
--    l'utilisateur (rôle authenticated), grant posé dans 20260828023000.
--    Sans ce droit, l'appel RPC échoue et la route retombe sur un simple select :
--    le statut n'est plus mis à jour à l'ouverture de l'app. On rétablit le grant.
--    C'est sans risque : la fonction ne peut plus que faire passer une période
--    échue en 'past_due', jamais l'étendre.
grant execute on function public.reset_subscription_period_if_needed(uuid) to authenticated;

-- 2. Rattrapage unique : passe tout de suite en 'past_due' les essais et les
--    abonnements payants déjà échus (renouvelés gratuitement par l'ancien code),
--    sans attendre leur prochain accès ni le cron de 3h. Le garde côté API
--    (lib/subscription/access.ts) bloque de toute façon en temps réel ; ceci
--    remet simplement la colonne status en cohérence.
select public.expire_trials();
