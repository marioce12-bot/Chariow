-- L'utilisateur confirme avoir installé le pixel Meta sur Chariow : le bandeau
-- "aucune conversion" disparaît alors même si Meta n'a pas encore remonté de ventes.
alter table public.meta_pixels
  add column if not exists configured_on_chariow boolean not null default false;
