-- Bouton d'appel à l'action (call_to_action.type de Meta) choisi dans l'étape 2 du
-- wizard ("Configuration de la publicité"). Jusqu'ici le type était codé en dur
-- à LEARN_MORE. NULL = campagne créée avant ce réglage : le lancement retombe sur
-- LEARN_MORE pour ne rien changer à leur comportement.
alter table public.ad_campaigns
  add column if not exists call_to_action text;
