-- Préférence de langue du compte, indépendante du navigateur utilisé.
alter table public.profiles
  add column if not exists preferred_locale text not null default 'fr';
alter table public.profiles
  drop constraint if exists profiles_preferred_locale_check;
alter table public.profiles
  add constraint profiles_preferred_locale_check check (preferred_locale in ('fr', 'en'));
notify pgrst, 'reload schema';
