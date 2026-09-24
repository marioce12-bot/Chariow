-- Solde publicitaire : ce que l'utilisateur a mis sur la carte au lancement de ses
-- campagnes (montant NET, sans la commission Vendeo de 2 %), et ses retraits.
--
-- Registre (ledger) à trois types de lignes :
--   deposit    : crédité par le webhook SasPay quand le paiement d'une campagne est
--                confirmé. Montant = budget net (budget/jour x durée), jamais le brut.
--   commit     : inscrit automatiquement (trigger) quand la campagne quitte l'état
--                "paid" pour partir chez Meta/TikTok : l'argent est alors engagé
--                auprès de la plateforme et ne fait plus partie du solde.
--   withdrawal : retrait demandé par l'utilisateur (pending -> completed | failed).
--
-- Solde          = deposits - commits - retraits (pending ou completed)
-- Retirable      = solde - montants réservés à des campagnes payées mais pas encore
--                  lancées ; et 0 tant qu'une campagne est en cours de création,
--                  en revue ou active.
create table public.ad_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('deposit', 'commit', 'withdrawal')),
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  campaign_id uuid references public.ad_campaigns(id) on delete set null,
  external_id text,
  network text,
  recipient_last4 text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index ad_wallet_deposit_external_idx on public.ad_wallet_transactions(external_id) where kind = 'deposit' and external_id is not null;
create unique index ad_wallet_commit_campaign_idx on public.ad_wallet_transactions(campaign_id) where kind = 'commit' and campaign_id is not null;
create index ad_wallet_user_created_idx on public.ad_wallet_transactions(user_id, created_at desc);
create index ad_wallet_campaign_idx on public.ad_wallet_transactions(campaign_id) where campaign_id is not null;

create trigger ad_wallet_transactions_updated_at before update on public.ad_wallet_transactions for each row execute procedure public.set_updated_at();

alter table public.ad_wallet_transactions enable row level security;
create policy "Users can read their ad wallet transactions" on public.ad_wallet_transactions for select using (auth.uid() = user_id);

-- Résumé du solde d'un utilisateur.
create or replace function public.ad_wallet_summary(target_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  deposits numeric;
  commits numeric;
  withdrawn numeric;
  pending_count integer;
  earmarked numeric;
  is_locked boolean;
  balance_value numeric;
begin
  select
    coalesce(sum(amount) filter (where kind = 'deposit'), 0),
    coalesce(sum(amount) filter (where kind = 'commit'), 0),
    coalesce(sum(amount) filter (where kind = 'withdrawal' and status in ('pending', 'completed')), 0),
    count(*) filter (where kind = 'withdrawal' and status = 'pending')
  into deposits, commits, withdrawn, pending_count
  from public.ad_wallet_transactions
  where user_id = target_user_id;

  select coalesce(sum(c.daily_budget * c.duration_days), 0) into earmarked
  from public.ad_campaigns c
  where c.user_id = target_user_id
    and c.status = 'paid'
    and exists (select 1 from public.ad_wallet_transactions t where t.campaign_id = c.id and t.kind = 'deposit')
    and not exists (select 1 from public.ad_wallet_transactions t where t.campaign_id = c.id and t.kind = 'commit');

  select exists (
    select 1 from public.ad_campaigns c
    where c.user_id = target_user_id and c.status in ('submitting', 'review', 'active')
  ) into is_locked;

  balance_value := greatest(deposits - commits - withdrawn, 0);
  return jsonb_build_object(
    'balance', balance_value,
    'reserved', least(earmarked, balance_value),
    'withdrawable', case when is_locked then 0 else greatest(balance_value - earmarked, 0) end,
    'locked', is_locked,
    'pending_withdrawals', pending_count
  );
end;
$$;

-- Crédite le solde quand le paiement d'une campagne est confirmé (idempotent).
create or replace function public.credit_ad_campaign_deposit(target_user_id uuid, target_campaign_id uuid, payment_id text, gross_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare net_amount numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('ad_wallet:' || target_user_id::text, 0));
  if exists (select 1 from public.ad_wallet_transactions where kind = 'deposit' and external_id = payment_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  select c.daily_budget * c.duration_days into net_amount
  from public.ad_campaigns c
  where c.id = target_campaign_id and c.user_id = target_user_id;
  -- Repli si la campagne a disparu entre-temps : 98 % du brut encaissé (2 % = commission Vendeo).
  if net_amount is null or net_amount <= 0 then net_amount := floor(gross_amount * 0.98); end if;
  if net_amount <= 0 then return jsonb_build_object('ok', false, 'code', 'invalid_amount'); end if;
  insert into public.ad_wallet_transactions(user_id, kind, amount, campaign_id, external_id, metadata)
  values (target_user_id, 'deposit', net_amount, (select id from public.ad_campaigns where id = target_campaign_id), payment_id, jsonb_build_object('gross_amount', gross_amount));
  return jsonb_build_object('ok', true, 'amount', net_amount);
end;
$$;

-- Engage les fonds dès que la campagne est envoyée à la plateforme publicitaire.
create or replace function public.ad_campaign_commit_funds()
returns trigger language plpgsql security definer set search_path = public as $$
declare committed numeric;
begin
  if new.status in ('review', 'active', 'completed')
     and old.status is distinct from new.status
     and exists (select 1 from public.ad_wallet_transactions t where t.campaign_id = new.id and t.kind = 'deposit')
     and not exists (select 1 from public.ad_wallet_transactions t where t.campaign_id = new.id and t.kind = 'commit') then
    committed := new.daily_budget * new.duration_days;
    if committed > 0 then
      insert into public.ad_wallet_transactions(user_id, kind, amount, campaign_id, metadata)
      values (new.user_id, 'commit', committed, new.id, jsonb_build_object('status', new.status));
    end if;
  end if;
  return new;
end;
$$;
create trigger ad_campaigns_commit_funds after update of status on public.ad_campaigns for each row execute procedure public.ad_campaign_commit_funds();

-- Réserve un retrait de façon atomique (verrou par utilisateur : pas de double retrait).
create or replace function public.reserve_ad_withdrawal(target_user_id uuid, amount_value numeric, network_code text, last4 text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare summary jsonb; new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ad_wallet:' || target_user_id::text, 0));
  if amount_value < 2000 then return jsonb_build_object('ok', false, 'code', 'below_minimum'); end if;
  summary := public.ad_wallet_summary(target_user_id);
  if (summary->>'locked')::boolean then return jsonb_build_object('ok', false, 'code', 'active_campaign'); end if;
  if amount_value > (summary->>'withdrawable')::numeric then
    return jsonb_build_object('ok', false, 'code', 'insufficient_balance', 'withdrawable', (summary->>'withdrawable')::numeric);
  end if;
  insert into public.ad_wallet_transactions(user_id, kind, amount, status, network, recipient_last4)
  values (target_user_id, 'withdrawal', amount_value, 'pending', network_code, last4)
  returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

-- Clôture un retrait : completed (argent envoyé) ou failed (le montant redevient disponible).
-- Un "failed" peut être corrigé en "completed" si SasPay confirme finalement l'envoi.
create or replace function public.finalize_ad_withdrawal(withdrawal_id uuid, new_status text, payout_id text default null, error_text text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if new_status not in ('completed', 'failed') then raise exception 'invalid_withdrawal_status'; end if;
  update public.ad_wallet_transactions
  set status = new_status, external_id = coalesce(payout_id, external_id), error_message = error_text
  where id = withdrawal_id and kind = 'withdrawal'
    and (status = 'pending' or (status = 'failed' and new_status = 'completed'));
  return found;
end;
$$;

revoke all on function public.ad_wallet_summary(uuid) from public, anon, authenticated;
revoke all on function public.credit_ad_campaign_deposit(uuid, uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.reserve_ad_withdrawal(uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.finalize_ad_withdrawal(uuid, text, text, text) from public, anon, authenticated;

-- Reprise de l'existant : chaque campagne déjà payée est créditée ; celles déjà parties
-- chez la plateforme sont aussitôt engagées, seules les campagnes "paid" en attente de
-- lancement restent réservées (aucun solde retirable n'apparaît par magie).
insert into public.ad_wallet_transactions(user_id, kind, amount, campaign_id, external_id, metadata, created_at)
select c.user_id, 'deposit', c.daily_budget * c.duration_days, c.id, 'backfill:' || c.id::text, jsonb_build_object('backfill', true), coalesce(c.paid_at, c.updated_at, c.created_at)
from public.ad_campaigns c
where c.status in ('paid', 'review', 'active', 'completed') and c.daily_budget * c.duration_days > 0;

insert into public.ad_wallet_transactions(user_id, kind, amount, campaign_id, metadata, created_at)
select c.user_id, 'commit', c.daily_budget * c.duration_days, c.id, jsonb_build_object('backfill', true), coalesce(c.paid_at, c.updated_at, c.created_at)
from public.ad_campaigns c
where c.status in ('review', 'active', 'completed') and c.daily_budget * c.duration_days > 0;
