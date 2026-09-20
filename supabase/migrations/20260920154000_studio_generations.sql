create table if not exists public.studio_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('image','video')),
  prompt text not null,
  options jsonb not null default '{}'::jsonb,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  credits_cost integer not null default 0 check (credits_cost >= 0),
  storage_path text,
  video_job_id text,
  parent_id uuid references public.studio_generations(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_generations_user_created_idx on public.studio_generations(user_id, created_at desc);
create trigger studio_generations_updated_at before update on public.studio_generations for each row execute procedure public.set_updated_at();
alter table public.studio_generations enable row level security;
drop policy if exists "Users can read their studio generations" on public.studio_generations;
create policy "Users can read their studio generations" on public.studio_generations for select using (auth.uid() = user_id);

insert into storage.buckets (id, name, public) values ('studio-media', 'studio-media', false) on conflict (id) do nothing;
drop policy if exists "Users can read own studio media" on storage.objects;
create policy "Users can read own studio media" on storage.objects for select using (bucket_id = 'studio-media' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
