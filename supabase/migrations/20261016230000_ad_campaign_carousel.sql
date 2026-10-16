-- Publicité carrousel (Meta) : images supplémentaires après l'image principale (media_url).
-- Tableau JSON d'URL https (0 à 9). NULL ou vide = publicité à image unique, comme avant.
alter table public.ad_campaigns
  add column if not exists carousel_urls jsonb;
