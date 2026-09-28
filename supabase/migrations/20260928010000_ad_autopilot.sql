-- Pilotage automatique des campagnes publicitaires.
-- L'utilisateur active l'option par campagne ; un cron évalue périodiquement la
-- rentabilité (dépense pub vs ventes réelles Chariow) et peut mettre en pause
-- automatiquement, en consignant le motif et en générant un rapport + une alerte.

alter table public.ad_campaigns
  add column if not exists autopilot_enabled boolean not null default false,
  add column if not exists autopilot_paused_at timestamptz,
  add column if not exists autopilot_pause_reason text;

create table if not exists public.ad_campaign_autopilot_reports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('meta', 'tiktok')),
  period_from date not null,
  period_to date not null,
  spend numeric(14,2) not null default 0,
  gross_revenue numeric(14,2) not null default 0,
  net_revenue numeric(14,2) not null default 0,
  completed_sales integer not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  roas numeric(14,4),
  cac numeric(14,4),
  decision text not null check (decision in ('keep_running', 'pause', 'learning', 'insufficient_data')),
  reasons text[] not null default '{}',
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists autopilot_reports_campaign_idx
  on public.ad_campaign_autopilot_reports(campaign_id, created_at desc);
create index if not exists autopilot_reports_user_idx
  on public.ad_campaign_autopilot_reports(user_id, created_at desc);

alter table public.ad_campaign_autopilot_reports enable row level security;
create policy "Users can read their autopilot reports"
  on public.ad_campaign_autopilot_reports for select using (auth.uid() = user_id);
