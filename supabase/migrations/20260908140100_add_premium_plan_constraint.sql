-- Autorise le plan Premium dans la contrainte qui lie plan et messages_limit.
-- messages_limit n'est plus utilisé pour bloquer l'accès IA (cf.
-- 20260908090000_unlimited_ai_usage.sql) mais reste une colonne "not null"
-- alimentée à la création de l'abonnement ; on lui donne la même valeur que
-- Starter (400) pour Premium, par simplicité, puisqu'elle est désormais
-- purement indicative.
alter table public.subscriptions drop constraint subscriptions_plan_limit_check;

alter table public.subscriptions add constraint subscriptions_plan_limit_check check (
  (plan = 'eco' and messages_limit = 100) or
  (plan = 'starter' and messages_limit = 400) or
  (plan = 'pro' and messages_limit = 1200) or
  (plan = 'premium' and messages_limit = 400)
);
