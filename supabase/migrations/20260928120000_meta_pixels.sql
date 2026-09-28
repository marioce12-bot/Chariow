create table if not exists public.meta_pixels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  pixel_id text not null,
  name text,
  last_fired_at timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ad_account_id, pixel_id)
);

create index if not exists meta_pixels_user_idx on public.meta_pixels(user_id);

create trigger meta_pixels_updated_at before update on public.meta_pixels for each row execute procedure public.set_updated_at();

alter table public.meta_pixels enable row level security;

create policy "Users can read their Meta pixels" on public.meta_pixels for select using (auth.uid() = user_id);
create policy "Users can create their Meta pixels" on public.meta_pixels for insert with check (auth.uid() = user_id);
create policy "Users can update their Meta pixels" on public.meta_pixels for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their Meta pixels" on public.meta_pixels for delete using (auth.uid() = user_id);
