-- Notifications in-app : messages administratifs, système et actions du pilote IA.
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'system' check (type in ('admin', 'autopilot', 'system')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 4000),
  action_url text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists user_notifications_user_created_idx on public.user_notifications(user_id, created_at desc);
create index if not exists user_notifications_user_unread_idx on public.user_notifications(user_id, read_at, created_at desc);
create unique index if not exists user_notifications_dedupe_idx on public.user_notifications(user_id, dedupe_key) where dedupe_key is not null;
alter table public.user_notifications enable row level security;
drop policy if exists "Users can read their notifications" on public.user_notifications;
create policy "Users can read their notifications" on public.user_notifications for select using (auth.uid() = user_id);
drop policy if exists "Users can update their notifications" on public.user_notifications;
create policy "Users can update their notifications" on public.user_notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Les insertions viennent des routes serveur avec service_role : jamais du navigateur.
revoke insert, delete on public.user_notifications from anon, authenticated;
notify pgrst, 'reload schema';
