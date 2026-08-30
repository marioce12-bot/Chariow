alter table public.ad_campaigns
  add column if not exists external_adset_id text,
  add column if not exists external_creative_id text,
  add column if not exists external_ad_id text;
