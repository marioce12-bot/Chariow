-- Réglages Advantage+ choisis dans le wizard (Meta uniquement) :
-- - advantage_audience : Meta peut élargir l'audience au-delà du ciblage choisi
--   (étape 3). NULL = campagne antérieure → désactivé, comme avant.
-- - advantage_creative : améliorations automatiques de la créative (étape 2,
--   « Configuration de la publicité »). NULL = campagne antérieure → valeur par
--   défaut du wizard (activé).
alter table public.ad_campaigns
  add column if not exists advantage_audience boolean,
  add column if not exists advantage_creative boolean;
