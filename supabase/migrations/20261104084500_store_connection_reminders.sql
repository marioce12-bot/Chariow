-- One onboarding reminder at most per account. The rollout timestamp prevents the
-- first cron run from emailing existing users created before this feature existed.
create table if not exists public.store_connection_reminder_sends (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.store_connection_reminder_config (
  id boolean primary key default true check (id),
  eligible_after timestamptz not null default now()
);

insert into public.store_connection_reminder_config (id)
values (true)
on conflict (id) do nothing;

alter table public.store_connection_reminder_sends enable row level security;
alter table public.store_connection_reminder_config enable row level security;
revoke all on table public.store_connection_reminder_sends from anon, authenticated;
revoke all on table public.store_connection_reminder_config from anon, authenticated;
notify pgrst, 'reload schema';
