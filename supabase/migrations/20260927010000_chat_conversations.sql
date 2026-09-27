create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_updated_idx on public.conversations(user_id, updated_at desc);

alter table public.messages add column conversation_id uuid references public.conversations(id) on delete cascade;

create index messages_conversation_created_idx on public.messages(conversation_id, created_at);

alter table public.conversations enable row level security;

create policy "Users can read their conversations" on public.conversations for select using (auth.uid() = user_id);
create policy "Users can create their conversations" on public.conversations for insert with check (auth.uid() = user_id);
create policy "Users can update their conversations" on public.conversations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger conversations_updated_at before update on public.conversations for each row execute procedure public.set_updated_at();

-- Regroupe les anciens messages (créés avant l'introduction des conversations)
-- dans une conversation par utilisateur, pour ne rien perdre de l'historique.
do $$
declare
  u record;
  conv_id uuid;
begin
  for u in select distinct user_id from public.messages where conversation_id is null loop
    insert into public.conversations (user_id, title)
    values (u.user_id, 'Conversation')
    returning id into conv_id;
    update public.messages set conversation_id = conv_id where user_id = u.user_id and conversation_id is null;
  end loop;
end;
$$;
