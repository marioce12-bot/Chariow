create table public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  message text check (message is null or char_length(message) <= 2000),
  status text not null default 'new' check (status in ('new','processed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index app_feedback_created_idx on public.app_feedback(created_at desc);
alter table public.app_feedback enable row level security;
create policy "Users can submit own feedback" on public.app_feedback for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can read own feedback" on public.app_feedback for select to authenticated using (auth.uid() = user_id);
create policy "Admins can read feedback" on public.app_feedback for select to authenticated using (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true));
create policy "Admins can update feedback status" on public.app_feedback for update to authenticated using (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true)) with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true));
