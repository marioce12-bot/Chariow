alter table public.user_notifications
  add column if not exists category text not null default 'general',
  add column if not exists replies_enabled boolean not null default false;

alter table public.user_notifications
  drop constraint if exists user_notifications_category_check;

alter table public.user_notifications
  add constraint user_notifications_category_check
  check (category in ('general', 'announcement', 'update', 'training', 'important', 'community'));

create table if not exists public.user_notification_replies (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.user_notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists user_notification_replies_notification_idx
  on public.user_notification_replies(notification_id, created_at desc);

alter table public.user_notification_replies enable row level security;
create policy "Users can read their notification replies"
  on public.user_notification_replies for select using (auth.uid() = user_id);
create policy "Users can create replies when enabled"
  on public.user_notification_replies for insert with check (
    auth.uid() = user_id and exists (
      select 1 from public.user_notifications n
      where n.id = notification_id and n.user_id = auth.uid() and n.replies_enabled = true
    )
  );
revoke update, delete on public.user_notification_replies from anon, authenticated;
grant select, insert on public.user_notification_replies to authenticated;
notify pgrst, 'reload schema';
