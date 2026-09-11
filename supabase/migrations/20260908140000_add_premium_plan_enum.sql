-- Ajoute le plan Premium (3 000 XOF / mois, jusqu'à 3 boutiques) à l'enum des plans.
-- Doit rester dans sa propre migration : Postgres n'autorise pas d'utiliser
-- une nouvelle valeur d'enum dans la même transaction que celle qui l'ajoute
-- (même contrainte que pour l'ajout du plan Éco, cf. 20260903091000).
alter type public.subscription_plan add value if not exists 'premium';
