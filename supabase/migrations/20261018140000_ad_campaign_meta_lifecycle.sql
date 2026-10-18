-- Preserve rows and reporting history when Meta confirms archive/deletion.
alter table public.ad_campaigns drop constraint if exists ad_campaigns_status_check;
alter table public.ad_campaigns add constraint ad_campaigns_status_check
  check (status in ('draft', 'account_required', 'pending_payment', 'paid', 'submitting', 'review', 'active', 'paused', 'autopilot_paused', 'rejected', 'error', 'completed', 'archived', 'deleted'));
