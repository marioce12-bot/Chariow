create extension if not exists pgcrypto;

create type public.subscription_plan as enum ('starter', 'pro');
create type public.subscription_status as enum ('active', 'cancelled', 'past_due');
create type public.store_platform as enum ('chariow', 'selar', 'gumroad');
create type public.message_role as enum ('user', 'assistant');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  plan public.subscription_plan not null default 'starter',
  messages_used_this_month integer not null default 0 check (messages_used_this_month >= 0),
  messages_limit integer not null default 400 check (messages_limit > 0),
  current_period_start date not null default date_trunc('month', current_date)::date,
  current_period_end date not null default (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  status public.subscription_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_plan_limit_check check (
    (plan = 'starter' and messages_limit = 400) or
    (plan = 'pro' and messages_limit = 1200)
  )
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform public.store_platform not null,
  store_name text not null,
  mcp_url text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  is_active boolean not null default true,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_connection_data_check check (mcp_url is not null or access_token_encrypted is not null)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  role public.message_role not null,
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now()
);

create index stores_user_id_idx on public.stores(user_id);
create index messages_user_created_idx on public.messages(user_id, created_at desc);
create index messages_store_created_idx on public.messages(store_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute procedure public.set_updated_at();
create trigger stores_updated_at before update on public.stores for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do update set email = excluded.email;
  insert into public.subscriptions (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.reset_subscription_period_if_needed(target_user_id uuid)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare result public.subscriptions;
begin
  update public.subscriptions
  set messages_used_this_month = 0,
      current_period_start = date_trunc('month', current_date)::date,
      current_period_end = (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
      updated_at = now()
  where user_id = target_user_id and current_period_end < current_date
  returning * into result;
  if result.id is null then select * into result from public.subscriptions where user_id = target_user_id; end if;
  return result;
end;
$$;

create or replace function public.consume_message_quota(target_user_id uuid)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare result public.subscriptions;
begin
  perform public.reset_subscription_period_if_needed(target_user_id);
  update public.subscriptions
  set messages_used_this_month = messages_used_this_month + 1, updated_at = now()
  where user_id = target_user_id and status = 'active' and messages_used_this_month < messages_limit
  returning * into result;
  return result;
end;
$$;

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stores enable row level security;
alter table public.messages enable row level security;

create policy "Users can read their profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update their profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users can read their subscription" on public.subscriptions for select using (auth.uid() = user_id);
create policy "Users can read their stores" on public.stores for select using (auth.uid() = user_id);
create policy "Users can create their stores" on public.stores for insert with check (auth.uid() = user_id);
create policy "Users can update their stores" on public.stores for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their stores" on public.stores for delete using (auth.uid() = user_id);
create policy "Users can read their messages" on public.messages for select using (auth.uid() = user_id);
create policy "Users can create their messages" on public.messages for insert with check (auth.uid() = user_id and (store_id is null or exists (select 1 from public.stores where id = store_id and user_id = auth.uid())));

revoke all on function public.reset_subscription_period_if_needed(uuid) from public, anon, authenticated;
revoke all on function public.consume_message_quota(uuid) from public, anon, authenticated;
