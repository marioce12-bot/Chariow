create or replace function public.get_current_admin(target_user_id uuid)
returns table (id uuid, user_id uuid, role public.admin_role, is_active boolean)
language sql
security definer
set search_path = public
as $$
  select a.id, a.user_id, a.role, a.is_active
  from public.admin_users a
  where a.user_id = target_user_id
    and a.is_active = true
  limit 1;
$$;

revoke all on function public.get_current_admin(uuid) from public, anon;
grant execute on function public.get_current_admin(uuid) to authenticated;
