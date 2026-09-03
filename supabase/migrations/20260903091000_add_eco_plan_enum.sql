-- Ajoute le plan Éco (2 900 XOF / 15 jours) à l'enum des plans.
-- Doit rester dans sa propre migration : Postgres n'autorise pas d'utiliser
-- une nouvelle valeur d'enum dans la même transaction que celle qui l'ajoute.
alter type public.subscription_plan add value if not exists 'eco';
