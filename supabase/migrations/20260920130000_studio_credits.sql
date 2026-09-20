create table public.credit_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('purchase', 'debit', 'refund')),
  credits integer not null check (credits > 0),
  balance_before integer not null,
  balance_after integer not null,
  operation text,
  model text,
  provider_cost integer,
  external_id text,
  status text not null default 'completed' check (status in ('pending', 'completed', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index credit_transactions_external_id_idx on public.credit_transactions(external_id) where external_id is not null;
create index credit_transactions_user_created_idx on public.credit_transactions(user_id, created_at desc);

create trigger credit_accounts_updated_at before update on public.credit_accounts for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user_credit_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.credit_accounts (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created_credit_account after insert on auth.users for each row execute procedure public.handle_new_user_credit_account();

insert into public.credit_accounts (user_id)
select id from public.profiles on conflict (user_id) do nothing;

create or replace function public.reserve_credits(target_user_id uuid, amount integer, operation_name text, model_name text, provider_amount integer, request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare account public.credit_accounts; available integer; transaction_id uuid;
begin
  if amount <= 0 then raise exception 'invalid_credit_amount'; end if;
  insert into public.credit_accounts (user_id) values (target_user_id) on conflict (user_id) do nothing;
  select * into account from public.credit_accounts where user_id = target_user_id for update;
  if exists (select 1 from public.credit_transactions where external_id = request_id and kind = 'debit') then
    return jsonb_build_object('ok', true, 'duplicate', true, 'balance', account.balance, 'reserved', account.reserved);
  end if;
  available := account.balance - account.reserved;
  if available < amount then return jsonb_build_object('ok', false, 'balance', account.balance, 'reserved', account.reserved, 'required', amount); end if;
  update public.credit_accounts set reserved = reserved + amount where user_id = target_user_id;
  insert into public.credit_transactions(user_id, kind, credits, balance_before, balance_after, operation, model, provider_cost, external_id, status)
  values(target_user_id, 'debit', amount, account.balance, account.balance, operation_name, model_name, provider_amount, request_id, 'pending') returning id into transaction_id;
  return jsonb_build_object('ok', true, 'transaction_id', transaction_id, 'balance', account.balance, 'reserved', account.reserved + amount);
end;
$$;

create or replace function public.complete_credit_debit(transaction_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare transaction_row public.credit_transactions; account public.credit_accounts;
begin
  select * into transaction_row from public.credit_transactions where id = transaction_id for update;
  if transaction_row.id is null then return false; end if;
  if transaction_row.status = 'completed' then return true; end if;
  select * into account from public.credit_accounts where user_id = transaction_row.user_id for update;
  update public.credit_accounts set balance = balance - transaction_row.credits, reserved = reserved - transaction_row.credits where user_id = transaction_row.user_id;
  update public.credit_transactions set balance_after = account.balance - transaction_row.credits, status = 'completed' where id = transaction_id;
  return true;
end;
$$;

create or replace function public.refund_credit_debit(transaction_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare transaction_row public.credit_transactions;
begin
  select * into transaction_row from public.credit_transactions where id = transaction_id for update;
  if transaction_row.id is null or transaction_row.status = 'refunded' then return false; end if;
  if transaction_row.status = 'pending' then update public.credit_accounts set reserved = reserved - transaction_row.credits where user_id = transaction_row.user_id;
  else update public.credit_accounts set balance = balance + transaction_row.credits where user_id = transaction_row.user_id; end if;
  update public.credit_transactions set status = 'refunded' where id = transaction_id;
  return true;
end;
$$;

create or replace function public.add_credits(target_user_id uuid, amount integer, payment_id text, metadata_value jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare account public.credit_accounts; before_balance integer;
begin
  if amount < 200 then raise exception 'minimum_credits_is_200'; end if;
  if exists (select 1 from public.credit_transactions where external_id = payment_id and kind = 'purchase') then
    select * into account from public.credit_accounts where user_id = target_user_id;
    return jsonb_build_object('ok', true, 'duplicate', true, 'balance', account.balance);
  end if;
  insert into public.credit_accounts (user_id) values (target_user_id) on conflict (user_id) do nothing;
  select * into account from public.credit_accounts where user_id = target_user_id for update;
  before_balance := account.balance;
  update public.credit_accounts set balance = balance + amount where user_id = target_user_id;
  insert into public.credit_transactions(user_id, kind, credits, balance_before, balance_after, operation, external_id, metadata)
  values(target_user_id, 'purchase', amount, before_balance, before_balance + amount, 'credit_purchase', payment_id, metadata_value);
  return jsonb_build_object('ok', true, 'balance', before_balance + amount);
end;
$$;

alter table public.credit_accounts enable row level security;
alter table public.credit_transactions enable row level security;
create policy "Users can read their credit account" on public.credit_accounts for select using (auth.uid() = user_id);
create policy "Users can read their credit transactions" on public.credit_transactions for select using (auth.uid() = user_id);
revoke all on function public.reserve_credits(uuid, integer, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.complete_credit_debit(uuid) from public, anon, authenticated;
revoke all on function public.refund_credit_debit(uuid) from public, anon, authenticated;
revoke all on function public.add_credits(uuid, integer, text, jsonb) from public, anon, authenticated;
