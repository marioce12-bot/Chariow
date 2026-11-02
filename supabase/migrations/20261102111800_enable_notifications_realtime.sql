-- Enable Supabase Realtime for notification INSERT events.
-- RLS policies on user_notifications continue to restrict visibility by auth.uid().
do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where pr.prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
      and n.nspname = 'public'
      and c.relname = 'user_notifications'
  ) then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
end
$$;
