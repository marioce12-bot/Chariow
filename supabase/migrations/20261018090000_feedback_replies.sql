-- Les réponses sont visibles via l'historique propriétaire et l'API admin.
alter table public.app_feedback
  add column if not exists reply text check (reply is null or char_length(reply) between 1 and 2000),
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by uuid references public.profiles(id) on delete set null;
-- La policy de lecture propriétaire existante demeure la seule policy de lecture générale.
notify pgrst, 'reload schema';
