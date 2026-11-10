-- Broadcast only generic invalidation scopes. Never serialize source rows or user/payment data.
CREATE OR REPLACE FUNCTION public.broadcast_admin_data_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_ARGV[0] NOT IN ('signup', 'billing', 'credits', 'campaigns', 'referrals', 'payouts') THEN
    RETURN NULL;
  END IF;

  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('scope', TG_ARGV[0]),
      'admin_data_changed',
      'vendeo:admin:invalidate',
      true
    );
  EXCEPTION WHEN OTHERS THEN
    -- Admin invalidation is best-effort; a Realtime outage must never block a signup,
    -- payment, subscription, credit movement, campaign update, referral or payout.
    RAISE WARNING 'Admin Realtime invalidation could not be sent';
  END;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_admin_data_changed() FROM PUBLIC, anon, authenticated;

-- Private-channel authorization is limited to the service-only admin topic and
-- the existing user-scoped Postgres Changes topics. Business-table RLS stays intact.
CREATE POLICY "Vendeo admin server can join invalidation topic"
ON realtime.messages
FOR SELECT
TO service_role
USING (
  extension = 'broadcast'
  AND (SELECT realtime.topic()) = 'vendeo:admin:invalidate'
);

CREATE POLICY "Vendeo users can join their notification channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'postgres_changes'
  AND split_part((SELECT realtime.topic()), ':', 1) = 'user-notifications'
  AND split_part((SELECT realtime.topic()), ':', 2) = (SELECT auth.uid())::text
);

CREATE POLICY "Vendeo store owners can join their sales channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'postgres_changes'
  AND split_part((SELECT realtime.topic()), ':', 1) = 'sales-events'
  AND EXISTS (
    SELECT 1
    FROM public.stores AS s
    WHERE s.id::text = split_part((SELECT realtime.topic()), ':', 2)
      AND s.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Vendeo users can join studio generation channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'postgres_changes'
  AND split_part((SELECT realtime.topic()), ':', 1) = 'studio-generation'
);

-- Signups.
DROP TRIGGER IF EXISTS admin_realtime_profiles_signup ON public.profiles;
CREATE TRIGGER admin_realtime_profiles_signup
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_data_changed('signup');

-- Subscription creation and material plan/status/trial/period changes only.
DROP TRIGGER IF EXISTS admin_realtime_subscriptions_insert ON public.subscriptions;
CREATE TRIGGER admin_realtime_subscriptions_insert
AFTER INSERT ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_data_changed('billing');

DROP TRIGGER IF EXISTS admin_realtime_subscriptions_update ON public.subscriptions;
CREATE TRIGGER admin_realtime_subscriptions_update
AFTER UPDATE OF plan, status, trial_active, trial_ends_at, current_period_start, current_period_end
ON public.subscriptions
FOR EACH ROW
WHEN (
  OLD.plan IS DISTINCT FROM NEW.plan
  OR OLD.status IS DISTINCT FROM NEW.status
  OR OLD.trial_active IS DISTINCT FROM NEW.trial_active
  OR OLD.trial_ends_at IS DISTINCT FROM NEW.trial_ends_at
  OR OLD.current_period_start IS DISTINCT FROM NEW.current_period_start
  OR OLD.current_period_end IS DISTINCT FROM NEW.current_period_end
)
EXECUTE FUNCTION public.broadcast_admin_data_changed('billing');

-- Payment and credit movements, including later status changes.
DROP TRIGGER IF EXISTS admin_realtime_payment_events_insert ON public.payment_events;
CREATE TRIGGER admin_realtime_payment_events_insert
AFTER INSERT ON public.payment_events
FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_data_changed('billing');

DROP TRIGGER IF EXISTS admin_realtime_payment_events_status ON public.payment_events;
CREATE TRIGGER admin_realtime_payment_events_status
AFTER UPDATE OF status ON public.payment_events
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.broadcast_admin_data_changed('billing');

DROP TRIGGER IF EXISTS admin_realtime_credit_transactions_insert ON public.credit_transactions;
CREATE TRIGGER admin_realtime_credit_transactions_insert
AFTER INSERT ON public.credit_transactions
FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_data_changed('credits');

DROP TRIGGER IF EXISTS admin_realtime_credit_transactions_status ON public.credit_transactions;
CREATE TRIGGER admin_realtime_credit_transactions_status
AFTER UPDATE OF status ON public.credit_transactions
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.broadcast_admin_data_changed('credits');

DROP TRIGGER IF EXISTS admin_realtime_credit_accounts_insert ON public.credit_accounts;
CREATE TRIGGER admin_realtime_credit_accounts_insert
AFTER INSERT ON public.credit_accounts
FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_data_changed('credits');

DROP TRIGGER IF EXISTS admin_realtime_credit_accounts_balance ON public.credit_accounts;
CREATE TRIGGER admin_realtime_credit_accounts_balance
AFTER UPDATE OF balance, reserved ON public.credit_accounts
FOR EACH ROW WHEN (OLD.balance IS DISTINCT FROM NEW.balance OR OLD.reserved IS DISTINCT FROM NEW.reserved)
EXECUTE FUNCTION public.broadcast_admin_data_changed('credits');

-- Campaign status and row lifecycle changes affect the admin's active-campaign view.
DROP TRIGGER IF EXISTS admin_realtime_campaigns_insert ON public.ad_campaigns;
CREATE TRIGGER admin_realtime_campaigns_insert
AFTER INSERT ON public.ad_campaigns
FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_data_changed('campaigns');

DROP TRIGGER IF EXISTS admin_realtime_campaigns_status ON public.ad_campaigns;
CREATE TRIGGER admin_realtime_campaigns_status
AFTER UPDATE OF status ON public.ad_campaigns
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.broadcast_admin_data_changed('campaigns');

DROP TRIGGER IF EXISTS admin_realtime_campaigns_delete ON public.ad_campaigns;
CREATE TRIGGER admin_realtime_campaigns_delete
AFTER DELETE ON public.ad_campaigns
FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_data_changed('campaigns');

-- Referral creation and payout lifecycle.
DROP TRIGGER IF EXISTS admin_realtime_referrals_insert ON public.referrals;
CREATE TRIGGER admin_realtime_referrals_insert
AFTER INSERT ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_data_changed('referrals');

DROP TRIGGER IF EXISTS admin_realtime_payouts_insert ON public.platform_payouts;
CREATE TRIGGER admin_realtime_payouts_insert
AFTER INSERT ON public.platform_payouts
FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_data_changed('payouts');

DROP TRIGGER IF EXISTS admin_realtime_payouts_status ON public.platform_payouts;
CREATE TRIGGER admin_realtime_payouts_status
AFTER UPDATE OF status ON public.platform_payouts
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.broadcast_admin_data_changed('payouts');
