begin;

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, enabled, description)
values (
  'studio_video_enabled',
  true,
  'Runtime kill switch for paid Studio video rendering.'
)
on conflict (key) do nothing;

alter table public.feature_flags enable row level security;
revoke all on table public.feature_flags from anon, authenticated;
grant select on table public.feature_flags to service_role;
grant update on table public.feature_flags to service_role;

commit;
