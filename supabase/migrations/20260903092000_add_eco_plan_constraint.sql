-- Met à jour la contrainte qui lie le plan à son quota de messages,
-- pour accepter le plan Éco (100 messages / 15 jours) en plus de Starter et Pro.
alter table public.subscriptions drop constraint subscriptions_plan_limit_check;

alter table public.subscriptions add constraint subscriptions_plan_limit_check check (
  (plan = 'eco' and messages_limit = 100) or
  (plan = 'starter' and messages_limit = 400) or
  (plan = 'pro' and messages_limit = 1200)
);
