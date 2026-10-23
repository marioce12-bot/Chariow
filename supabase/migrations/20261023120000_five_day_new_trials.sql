-- New registrations receive exactly five days; existing trial deadlines stay unchanged.
-- Do not replay the historical trial backfill or welcome-credit grant.
alter table public.subscriptions
  alter column trial_ends_at set default (now() + interval '120 hours');

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do update set email = excluded.email;
  insert into public.subscriptions (user_id, plan, status, trial_active, trial_ends_at, messages_limit)
  values (new.id, 'starter', 'trialing', true, now() + interval '120 hours', 400)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
