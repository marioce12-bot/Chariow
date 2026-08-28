alter table public.meta_oauth_states enable row level security;

drop policy if exists "Users can create their Meta OAuth states"
on public.meta_oauth_states;

create policy "Users can create their Meta OAuth states"
on public.meta_oauth_states
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can read their Meta OAuth states"
on public.meta_oauth_states;

create policy "Users can read their Meta OAuth states"
on public.meta_oauth_states
for select
using (auth.uid() = user_id);

drop policy if exists "Users can delete their Meta OAuth states"
on public.meta_oauth_states;

create policy "Users can delete their Meta OAuth states"
on public.meta_oauth_states
for delete
using (auth.uid() = user_id);
