-- daily_budget est désormais en dollars US (wizard "Lancer une pub" et assistant IA,
-- qui convertit le budget saisi en XOF/EUR/USD avant l'enregistrement). L'ancien
-- minimum de 100 datait de l'époque où ce champ était en XOF et rejetait tout
-- budget réaliste en dollars (ex. 2 $, 5 $). Aligné sur le minimum de 1 $ appliqué
-- par /api/ad-campaigns et /api/ai/launch-campaign.
alter table public.ad_campaigns
  drop constraint if exists ad_campaigns_daily_budget_check;
alter table public.ad_campaigns
  add constraint ad_campaigns_daily_budget_check check (daily_budget >= 1);
