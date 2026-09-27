-- Ajoute le ciblage géographique détaillé (régions/villes Meta) choisi via le
-- nouveau widget de recherche d'audience du wizard "Lancer une pub"
-- (composants/vendeo/wizard/LocationSearchInput.tsx). `countries` (text[])
-- reste la donnée de compatibilité utilisée par TikTok et par le repli Meta ;
-- `geo_targeting` porte en plus le détail région/ville quand l'utilisateur en
-- a choisi via la recherche.
alter table ad_campaigns
  add column if not exists geo_targeting jsonb;

comment on column ad_campaigns.geo_targeting is
  'Ciblage géographique détaillé (Meta uniquement) : { countries: string[], regions: {key,name}[], cities: {key,name,radius,distance_unit}[] }. Null si seuls des pays ont été choisis.';
