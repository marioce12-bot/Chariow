-- Keep approval, preparation, delivery and unverifiable states distinct.
-- No campaign status or autopilot preference is changed by this migration.
alter table public.ad_campaigns
  add column if not exists meta_delivery_observation jsonb;

alter table public.ad_campaigns drop constraint if exists ad_campaigns_status_check;
alter table public.ad_campaigns add constraint ad_campaigns_status_check
  check (status in ('draft', 'account_required', 'pending_payment', 'paid', 'submitting', 'review', 'preparing', 'unknown', 'active', 'paused', 'autopilot_paused', 'rejected', 'error', 'completed', 'archived', 'deleted'));
