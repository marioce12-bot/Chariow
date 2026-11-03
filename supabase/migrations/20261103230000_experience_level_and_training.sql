-- New accounts can personalize the onboarding without changing access to Vendeo.
-- Existing accounts keep the default "experienced" value.
alter table public.profiles
  add column if not exists experience_level text not null default 'experienced';

alter table public.profiles
  drop constraint if exists profiles_experience_level_check;

alter table public.profiles
  add constraint profiles_experience_level_check
  check (experience_level in ('beginner', 'some_experience', 'experienced', 'expert'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_level text := coalesce(new.raw_user_meta_data->>'experience_level', 'experienced');
begin
  if requested_level not in ('beginner', 'some_experience', 'experienced', 'expert') then
    requested_level := 'experienced';
  end if;

  insert into public.profiles (id, email, full_name, experience_level)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    requested_level
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    experience_level = case
      when public.profiles.experience_level = 'experienced'
       and new.raw_user_meta_data ? 'experience_level'
      then excluded.experience_level
      else public.profiles.experience_level
    end;

  insert into public.subscriptions (user_id, plan, status, trial_active, trial_ends_at, messages_limit)
  values (new.id, 'starter', 'trialing', true, now() + interval '120 hours', 400)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

notify pgrst, 'reload schema';
