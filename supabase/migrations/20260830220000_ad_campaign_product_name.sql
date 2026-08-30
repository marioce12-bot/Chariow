alter table public.ad_campaigns
  add column if not exists product_name text;
