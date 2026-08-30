alter table public.ad_campaigns
  add column if not exists meta_ad_account_id uuid references public.meta_ad_accounts(id) on delete set null;

create index if not exists ad_campaigns_meta_account_idx
  on public.ad_campaigns(meta_ad_account_id, status);
