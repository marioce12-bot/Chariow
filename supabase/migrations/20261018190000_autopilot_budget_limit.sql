alter table public.ad_campaigns
  add column if not exists autopilot_budget_limit numeric(18,3),
  add column if not exists autopilot_budget_limit_currency text;

alter table public.ad_campaigns
  add constraint ad_campaigns_autopilot_budget_limit_positive_finite
  check (autopilot_budget_limit is null or (autopilot_budget_limit > 0 and autopilot_budget_limit < 'Infinity'::numeric)),
  add constraint ad_campaigns_autopilot_budget_limit_currency_pair
  check ((autopilot_budget_limit is null and autopilot_budget_limit_currency is null) or
         (autopilot_budget_limit is not null and autopilot_budget_limit_currency is not null));
