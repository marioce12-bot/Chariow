-- app/api/ai/launch-campaign (lancement d'une campagne Meta depuis l'assistant
-- IA) n'a pas toujours un produit précis du catalogue Chariow à associer à la
-- campagne : contrairement au wizard "Lancer une pub" (section Pub), qui part
-- toujours d'une fiche produit sélectionnée à l'étape 1, l'IA construit son
-- brief à partir de la conversation et peut très bien lancer une pub générique
-- pour la boutique entière.
--
-- product_id était "not null" sans valeur par défaut (voir
-- 20260830180000_ad_campaign_drafts.sql) : toute campagne insérée sans cette
-- valeur échouait silencieusement (l'appelant ne vérifiait pas l'erreur
-- Postgres), ce qui explique qu'une campagne lancée depuis l'assistant IA
-- pouvait être créée avec succès chez Meta — et dépenser réellement — sans
-- jamais apparaître dans "Mes campagnes" côté Vendeo.
alter table public.ad_campaigns
  alter column product_id drop not null;
