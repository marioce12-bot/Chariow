-- Rechargement direct du solde publicitaire + prélèvement au lancement.
--
-- Au lieu de payer à chaque lancement de campagne, l'utilisateur recharge son
-- portefeuille Vendeo (dépôt générique, sans campagne liée), puis le lancement
-- d'une campagne prélève atomiquement son budget sur ce solde.

-- 1) Crédite un rechargement générique (non lié à une campagne). Idempotent sur
--    l'id de transaction SasPay pour ne jamais créditer deux fois.
create or replace function public.credit_ad_wallet_topup(target_user_id uuid, net_amount numeric, payment_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if net_amount <= 0 then return jsonb_build_object('ok', false, 'code', 'invalid_amount'); end if;
  if exists (select 1 from public.ad_wallet_transactions where kind = 'deposit' and external_id = payment_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  insert into public.ad_wallet_transactions(user_id, kind, amount, external_id, metadata)
  values (target_user_id, 'deposit', net_amount, payment_id, jsonb_build_object('source', 'topup'));
  return jsonb_build_object('ok', true, 'amount', net_amount);
end;
$$;

-- 2) Vérifie le solde et prélève le budget d'une campagne (atomique, verrou par
--    utilisateur). Renvoie le code 'insufficient_balance' si le solde ne couvre
--    pas le budget net (daily_budget x duration_days).
create or replace function public.ad_wallet_commit_campaign(target_user_id uuid, target_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  summary jsonb;
  net numeric;
  balance_value numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('ad_wallet:' || target_user_id::text, 0));
  select daily_budget * duration_days into net
  from public.ad_campaigns
  where id = target_campaign_id and user_id = target_user_id;
  if net is null or net <= 0 then return jsonb_build_object('ok', false, 'code', 'invalid_campaign'); end if;

  if exists (select 1 from public.ad_wallet_transactions where campaign_id = target_campaign_id and kind = 'commit') then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  summary := public.ad_wallet_summary(target_user_id);
  balance_value := coalesce((summary->>'balance')::numeric, 0);
  if balance_value < net then
    return jsonb_build_object('ok', false, 'code', 'insufficient_balance', 'balance', balance_value, 'required', net);
  end if;

  insert into public.ad_wallet_transactions(user_id, kind, amount, campaign_id, metadata)
  values (target_user_id, 'commit', net, target_campaign_id, jsonb_build_object('source', 'wallet_launch'));
  return jsonb_build_object('ok', true, 'amount', net);
end;
$$;

-- 3) Libère le prélèvement si Meta/TikTok refuse la création : le solde est rendu.
create or replace function public.ad_wallet_release_campaign(target_user_id uuid, target_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from public.ad_wallet_transactions
  where user_id = target_user_id and campaign_id = target_campaign_id and kind = 'commit';
  return found;
end;
$$;

revoke all on function public.credit_ad_wallet_topup(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.ad_wallet_commit_campaign(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ad_wallet_release_campaign(uuid, uuid) from public, anon, authenticated;
