alter table public.ad_campaigns
  add column if not exists ad_set_name text,
  add column if not exists ad_name text;
