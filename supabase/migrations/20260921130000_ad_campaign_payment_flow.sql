-- Le flux de paiement des campagnes pub (checkout SasPay + webhook) utilisait
-- déjà les statuts "pending_payment" et "paid" et la colonne saspay_checkout_id
-- (voir app/api/ad-campaigns/[id]/checkout et app/api/webhooks/saspay), mais
-- aucune migration ne les avait jamais créés : la contrainte de statut
-- rejetait ces valeurs et la colonne n'existait pas. Le paiement d'une
-- campagne échouait donc systématiquement en base. Corrige ce décalage.
--
-- Ajoute aussi :
-- - paid_at : distingue de façon fiable "le paiement de cette campagne a déjà
--   été encaissé" du statut courant, qui peut redevenir "error" après un refus
--   de la plateforme publicitaire (Meta/TikTok) sans que le paiement ne soit
--   perdu pour autant — voir /api/ad-campaigns/[id]/launch.
-- - meta_page_id : la page Facebook choisie à l'étape 2 du wizard n'était
--   jamais enregistrée sur le brouillon, seulement gardée en mémoire côté
--   client. Une fois le paiement déplacé AVANT la création chez Meta (nouveau
--   flux), la reprise d'une campagne depuis "Mes campagnes" doit pouvoir
--   retrouver la page choisie sans repasser par le wizard.
alter table public.ad_campaigns
  drop constraint if exists ad_campaigns_status_check;
alter table public.ad_campaigns
  add constraint ad_campaigns_status_check check (status in (
    'draft', 'account_required', 'pending_payment', 'paid', 'submitting',
    'review', 'active', 'paused', 'rejected', 'error', 'completed'
  ));

alter table public.ad_campaigns
  add column if not exists saspay_checkout_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists meta_page_id text;
