alter table public.ad_campaigns
  add column if not exists meta_targeting jsonb;

comment on column public.ad_campaigns.meta_targeting is
  'Ciblage facultatif Meta : gender (male/female/null) et interests (identifiants/noms adinterest Meta).';
