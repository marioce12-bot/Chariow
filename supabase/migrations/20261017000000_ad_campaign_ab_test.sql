-- Test A/B Meta (Split Test natif) au lancement d'une campagne.
--
-- Une campagne lancée en test A/B contient deux ensembles de pubs : A (texte d'origine, ids habituels
-- external_adset_id / external_creative_id / external_ad_id) et B (variante de texte et de titre générée
-- par l'IA). Ces colonnes gardent l'ensemble B et le test (« étude » Meta, POST /{business_id}/ad_studies)
-- pour pouvoir afficher et comparer les deux versions plus tard.
alter table public.ad_campaigns
  add column if not exists ab_test boolean not null default false,
  add column if not exists ab_study_id text,
  add column if not exists ab_adset_b_id text,
  add column if not exists ab_creative_b_id text,
  add column if not exists ab_ad_b_id text,
  add column if not exists ab_message_b text,
  add column if not exists ab_headline_b text;
